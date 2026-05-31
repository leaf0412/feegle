import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { RuntimeEffectExecutor } from "@core/runtime/runtime-effect-executor.js";

describe("RuntimeEffectExecutor", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: RuntimeStore;
  let handlers: EffectHandlerRegistry;

  function seedRun(runAttemptId: string, workflowInstanceId: string, stepStateId: string, now: string) {
    store.createWorkflowInstance({
      id: workflowInstanceId,
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "def_test",
      definitionVersion: 1,
      status: "running",
      now
    });
    store.createRunAttempt({
      id: runAttemptId,
      workflowInstanceId,
      status: "running",
      triggerEventId: null,
      now
    });
    store.createStepState({
      id: stepStateId,
      workflowInstanceId,
      runAttemptId,
      stepId: "test_step",
      status: "running",
      input: {},
      now
    });
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-effect-executor-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    store = new RuntimeStore(db);
    handlers = new EffectHandlerRegistry();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("executes an effect successfully and records started/succeeded events", async () => {
    handlers.register({
      pluginId: "test",
      effectType: "greet",
      execute: async (effect) => ({ greeting: `hello ${(effect.input as { name: string }).name}` })
    });

    seedRun("run_1", "wfi_1", "step_1", "2026-05-31T00:01:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers);
    const result = await executor.execute({
      effectId: "eff_1",
      pluginId: "test",
      effectType: "greet",
      input: { name: "world" },
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      stepStateId: "step_1",
      now: "2026-05-31T00:01:00.000Z"
    });

    expect(result).toEqual({ greeting: "hello world" });

    const effectRecord = store.getEffectExecution("eff_1");
    expect(effectRecord?.status).toBe("succeeded");
    expect(effectRecord?.outputSummary).toEqual({ greeting: "hello world" });

    const events = store.listRuntimeEvents("wfi_1");
    const effectEvents = events.filter((e) => e.type.startsWith("effect."));
    expect(effectEvents.map((e) => e.type)).toEqual([
      "effect.started",
      "effect.succeeded"
    ]);
  });

  it("records failure and normalized error when handler throws", async () => {
    handlers.register({
      pluginId: "test",
      effectType: "failing",
      execute: async () => { throw new Error("boom"); }
    });

    seedRun("run_fail", "wfi_fail", "step_fail", "2026-05-31T00:02:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers);
    await expect(
      executor.execute({
        effectId: "eff_fail",
        pluginId: "test",
        effectType: "failing",
        input: {},
        workspaceId: "ws_1",
        workflowInstanceId: "wfi_fail",
        runAttemptId: "run_fail",
        stepStateId: "step_fail",
        now: "2026-05-31T00:02:00.000Z"
      })
    ).rejects.toMatchObject({
      code: "EFFECT_FAILED",
      category: "capability"
    });

    const effectRecord = store.getEffectExecution("eff_fail");
    expect(effectRecord?.status).toBe("failed");

    const events = store.listRuntimeEvents("wfi_fail");
    const effectEvents = events.filter((e) => e.type.startsWith("effect."));
    expect(effectEvents.map((e) => e.type)).toEqual([
      "effect.started",
      "effect.failed"
    ]);
  });

  it("fails with normalized capability error when no handler is registered", async () => {
    seedRun("run_missing", "wfi_missing", "step_missing", "2026-05-31T00:03:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers);
    await expect(
      executor.execute({
        effectId: "eff_missing",
        pluginId: "nonexistent",
        effectType: "do_something",
        input: {},
        workspaceId: "ws_1",
        workflowInstanceId: "wfi_missing",
        runAttemptId: "run_missing",
        stepStateId: "step_missing",
        now: "2026-05-31T00:03:00.000Z"
      })
    ).rejects.toMatchObject({
      code: "EFFECT_HANDLER_NOT_FOUND",
      category: "capability"
    });

    const effectRecord = store.getEffectExecution("eff_missing");
    expect(effectRecord?.status).toBe("failed");
  });

  it("returns existing result for duplicate idempotency key without re-executing", async () => {
    let callCount = 0;
    handlers.register({
      pluginId: "test",
      effectType: "idempotent",
      execute: async () => {
        callCount++;
        return { count: callCount };
      }
    });

    seedRun("run_idem", "wfi_idem", "step_idem", "2026-05-31T00:04:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers);
    const first = await executor.execute({
      effectId: "eff_idem_1",
      pluginId: "test",
      effectType: "idempotent",
      input: {},
      idempotencyKey: "key_abc",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_idem",
      runAttemptId: "run_idem",
      stepStateId: "step_idem",
      now: "2026-05-31T00:04:00.000Z"
    });

    expect(first).toEqual({ count: 1 });
    expect(callCount).toBe(1);

    const second = await executor.execute({
      effectId: "eff_idem_2",
      pluginId: "test",
      effectType: "idempotent",
      input: {},
      idempotencyKey: "key_abc",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_idem",
      runAttemptId: "run_idem",
      stepStateId: "step_idem",
      now: "2026-05-31T00:05:00.000Z"
    });

    expect(second).toEqual({ count: 1 });
    expect(callCount).toBe(1);

    const effectRecord = store.getEffectExecution("eff_idem_1");
    expect(effectRecord?.status).toBe("succeeded");
  });

  it("throws IDEMPOTENCY_CONFLICT when same key used with different input", async () => {
    handlers.register({
      pluginId: "test",
      effectType: "idem_conflict",
      execute: async (effect) => ({ result: (effect.input as { value: string }).value })
    });

    seedRun("run_conflict", "wfi_conflict", "step_conflict", "2026-05-31T00:05:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers);

    // First execution succeeds
    await executor.execute({
      effectId: "eff_conflict_1",
      pluginId: "test",
      effectType: "idem_conflict",
      input: { value: "original" },
      idempotencyKey: "key_conflict",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_conflict",
      runAttemptId: "run_conflict",
      stepStateId: "step_conflict",
      now: "2026-05-31T00:05:00.000Z"
    });

    // Second execution with same key but different input should throw conflict
    await expect(
      executor.execute({
        effectId: "eff_conflict_2",
        pluginId: "test",
        effectType: "idem_conflict",
        input: { value: "different" },
        idempotencyKey: "key_conflict",
        workspaceId: "ws_1",
        workflowInstanceId: "wfi_conflict",
        runAttemptId: "run_conflict",
        stepStateId: "step_conflict",
        now: "2026-05-31T00:06:00.000Z"
      })
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      category: "validation",
      message: "same key, different input"
    });
  });

  it("normalizes unknown errors with retryable: false, recoverable: false", async () => {
    handlers.register({
      pluginId: "test",
      effectType: "strange_fail",
      execute: async () => { throw "raw string error"; }
    });

    seedRun("run_raw", "wfi_raw", "step_raw", "2026-05-31T00:06:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers);
    await expect(
      executor.execute({
        effectId: "eff_raw",
        pluginId: "test",
        effectType: "strange_fail",
        input: {},
        workspaceId: "ws_1",
        workflowInstanceId: "wfi_raw",
        runAttemptId: "run_raw",
        stepStateId: "step_raw",
        now: "2026-05-31T00:06:00.000Z"
      })
    ).rejects.toMatchObject({
      code: "EFFECT_FAILED",
      category: "capability",
      retryable: false,
      recoverable: false
    });
  });

  it("emits events in correct order: started before succeeded", async () => {
    const seen: string[] = [];
    handlers.register({
      pluginId: "test",
      effectType: "order_check",
      execute: async () => {
        // Check what events exist at the moment the handler runs
        const events = store.listRuntimeEvents("wfi_order");
        const statuses = events.filter((e) => e.type.startsWith("effect.")).map((e) => e.type);
        seen.push(...statuses);
        return { ok: true };
      }
    });

    seedRun("run_order", "wfi_order", "step_order", "2026-05-31T00:06:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers);
    await executor.execute({
      effectId: "eff_order",
      pluginId: "test",
      effectType: "order_check",
      input: {},
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_order",
      runAttemptId: "run_order",
      stepStateId: "step_order",
      now: "2026-05-31T00:06:00.000Z"
    });

    // At handler execution time, only effect.started should exist
    expect(seen).toEqual(["effect.started"]);

    // After execution, both events should exist
    const events = store.listRuntimeEvents("wfi_order");
    const effectEvents = events.filter((e) => e.type.startsWith("effect."));
    expect(effectEvents.map((e) => e.type)).toEqual([
      "effect.started",
      "effect.succeeded"
    ]);
  });
});
