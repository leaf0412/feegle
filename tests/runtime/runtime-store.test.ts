import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { RuntimeStore } from "../../src/core/runtime/runtime-store.js";

describe("runtime schema", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-runtime-store-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates durable runtime tables before workflow execution exists", () => {
    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all() as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "workflow_definitions",
        "workflow_instances",
        "run_attempts",
        "step_states",
        "effect_executions",
        "runtime_events"
      ])
    );
  });

  it("creates attempts before execution and appends runtime events", () => {
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    const store = new RuntimeStore(db);

    store.registerWorkflowDefinition({
      id: "test.echo",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now: "2026-05-30T00:00:01.000Z"
    });
    store.createWorkflowInstance({
      id: "wfi_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.echo",
      definitionVersion: 1,
      status: "running",
      now: "2026-05-30T00:00:02.000Z"
    });
    store.createRunAttempt({
      id: "run_1",
      workflowInstanceId: "wfi_1",
      status: "running",
      triggerEventId: null,
      now: "2026-05-30T00:00:03.000Z"
    });

    expect(store.getActiveMutatingAttempt("wfi_1")?.id).toBe("run_1");
  });

  it("marks running attempts interrupted on startup instead of treating them as successful", () => {
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    const store = new RuntimeStore(db);
    store.registerWorkflowDefinition({
      id: "test.echo",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now: "2026-05-30T00:00:01.000Z"
    });
    store.createWorkflowInstance({
      id: "wfi_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.echo",
      definitionVersion: 1,
      status: "running",
      now: "2026-05-30T00:00:02.000Z"
    });
    store.createRunAttempt({
      id: "run_1",
      workflowInstanceId: "wfi_1",
      status: "running",
      triggerEventId: null,
      now: "2026-05-30T00:00:03.000Z"
    });

    const count = store.markRunningAttemptsInterrupted("2026-05-30T00:05:00.000Z");

    expect(count).toBe(1);
    expect(store.getRunAttempt("run_1")?.status).toBe("interrupted");
  });

  it("records step state transitions and runtime events for diagnostics", () => {
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z')`
    ).run();
    const store = new RuntimeStore(db);
    store.registerWorkflowDefinition({
      id: "test.diagnostic",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now: "2026-05-31T00:00:01.000Z"
    });
    store.createWorkflowInstance({
      id: "wfi_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.diagnostic",
      definitionVersion: 1,
      status: "running",
      now: "2026-05-31T00:00:02.000Z"
    });
    store.createRunAttempt({
      id: "run_1",
      workflowInstanceId: "wfi_1",
      status: "running",
      triggerEventId: "trg_1",
      now: "2026-05-31T00:00:03.000Z"
    });

    store.createStepState({
      id: "step_state_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      stepId: "collect",
      status: "running",
      input: { text: "hello" },
      now: "2026-05-31T00:00:04.000Z"
    });
    store.updateStepState({
      id: "step_state_1",
      status: "succeeded",
      output: { ok: true },
      waitCondition: null,
      error: null,
      now: "2026-05-31T00:00:05.000Z"
    });
    store.appendRuntimeEvent({
      id: "evt_1",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      stepStateId: "step_state_1",
      effectExecutionId: null,
      category: "required",
      type: "step.succeeded",
      payload: { stepId: "collect" },
      now: "2026-05-31T00:00:05.000Z"
    });

    expect(store.getStepState("step_state_1")).toMatchObject({
      id: "step_state_1",
      status: "succeeded",
      output: { ok: true }
    });
    expect(store.listRuntimeEvents("wfi_1").map((event) => event.type)).toEqual(["step.succeeded"]);
  });

  it("records effect executions with idempotency keys before external IO is retried", () => {
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z')`
    ).run();
    const store = new RuntimeStore(db);
    store.registerWorkflowDefinition({
      id: "test.effect",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now: "2026-05-31T00:00:01.000Z"
    });
    store.createWorkflowInstance({
      id: "wfi_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.effect",
      definitionVersion: 1,
      status: "running",
      now: "2026-05-31T00:00:02.000Z"
    });
    store.createRunAttempt({
      id: "run_1",
      workflowInstanceId: "wfi_1",
      status: "running",
      triggerEventId: null,
      now: "2026-05-31T00:00:03.000Z"
    });
    store.createStepState({
      id: "step_state_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      stepId: "reply",
      status: "running",
      input: {},
      now: "2026-05-31T00:00:04.000Z"
    });

    store.createEffectExecution({
      id: "eff_1",
      runAttemptId: "run_1",
      stepStateId: "step_state_1",
      pluginId: "feishu",
      effectType: "message.reply",
      status: "running",
      idempotencyKey: "feishu:reply:om_1",
      inputSummary: { textLength: 2 },
      now: "2026-05-31T00:00:05.000Z"
    });
    store.updateEffectExecution({
      id: "eff_1",
      status: "succeeded",
      outputSummary: { messageId: "om_reply" },
      error: null,
      now: "2026-05-31T00:00:06.000Z"
    });

    expect(store.getEffectExecution("eff_1")).toMatchObject({
      id: "eff_1",
      status: "succeeded",
      outputSummary: { messageId: "om_reply" }
    });
  });
});
