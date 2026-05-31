import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { EffectHandlerRegistry } from "../../src/core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "../../src/core/runtime/runtime-effect-executor.js";
import { RuntimeStore } from "../../src/core/runtime/runtime-store.js";
import { WorkflowRegistry } from "../../src/core/runtime/workflow-registry.js";
import { WorkflowRuntime } from "../../src/core/runtime/workflow-runtime.js";

describe("WorkflowRuntime.resume", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-workflow-resume-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeRuntime(registry: WorkflowRegistry, store: RuntimeStore) {
    return new WorkflowRuntime(store, registry, new RuntimeEffectExecutor(store, new EffectHandlerRegistry()));
  }

  it("resumes a waiting workflow from a control_action signal", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.approve_then_continue",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        {
          stepId: "approval",
          run: () => ({
            kind: "wait",
            reason: "needs approval",
            waitFor: { kind: "control_action", action: "approve_step" },
            output: { draft: "done" }
          })
        },
        {
          stepId: "publish",
          run: (ctx) => ({
            kind: "complete",
            output: { published: true, input: ctx.input }
          })
        }
      ]
    });

    const store = new RuntimeStore(db);
    const runtime = makeRuntime(registry, store);

    // Start workflow → goes to waiting
    await runtime.start({
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.approve_then_continue",
      input: { text: "hello" },
      now: "2026-05-31T00:01:00.000Z"
    });

    expect(store.getWorkflowInstance("wfi_1")?.status).toBe("waiting");

    // Resume with matching signal
    const result = await runtime.resume({
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_2",
      signal: {
        signalId: "sig_1",
        kind: "control_action",
        payload: { action: "approve_step" }
      },
      workspaceId: "ws_1",
      now: "2026-05-31T00:02:00.000Z"
    });

    expect(result.status).toBe("succeeded");
    expect(store.getWorkflowInstance("wfi_1")?.status).toBe("succeeded");

    // Verify signal event was emitted
    const events = store.listRuntimeEvents("wfi_1");
    expect(events.map((e) => e.type)).toContain("workflow.signal_received");
    expect(events.map((e) => e.type)).toContain("step.resumed");
  });

  it("rejects a mismatched signal action", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.wait_approve",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        {
          stepId: "approval",
          run: () => ({
            kind: "wait",
            reason: "needs approval",
            waitFor: { kind: "control_action", action: "approve_step" }
          })
        }
      ]
    });

    const store = new RuntimeStore(db);
    const runtime = makeRuntime(registry, store);

    await runtime.start({
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.wait_approve",
      input: {},
      now: "2026-05-31T00:01:00.000Z"
    });

    await expect(
      runtime.resume({
        workflowInstanceId: "wfi_1",
        runAttemptId: "run_2",
        signal: {
          signalId: "sig_bad",
          kind: "control_action",
          payload: { action: "wrong_action" }
        },
        workspaceId: "ws_1",
        now: "2026-05-31T00:02:00.000Z"
      })
    ).rejects.toThrow("signal action mismatch");

    // State unchanged
    expect(store.getWorkflowInstance("wfi_1")?.status).toBe("waiting");
  });

  it("rejects resume on a non-waiting workflow", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.complete",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [{ stepId: "done", run: () => ({ kind: "complete" }) }]
    });

    const store = new RuntimeStore(db);
    const runtime = makeRuntime(registry, store);

    await runtime.start({
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.complete",
      input: {},
      now: "2026-05-31T00:01:00.000Z"
    });

    await expect(
      runtime.resume({
        workflowInstanceId: "wfi_1",
        runAttemptId: "run_2",
        signal: { signalId: "sig_1", kind: "control_action", payload: { action: "approve" } },
        workspaceId: "ws_1",
        now: "2026-05-31T00:02:00.000Z"
      })
    ).rejects.toThrow("not waiting");
  });

  it("creates a new run attempt separate from the original waiting attempt", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.wait_then_done",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        {
          stepId: "pause",
          run: () => ({
            kind: "wait",
            reason: "pause",
            waitFor: { kind: "control_action", action: "resume" }
          })
        },
        {
          stepId: "finish",
          run: () => ({ kind: "complete" })
        }
      ]
    });

    const store = new RuntimeStore(db);
    const runtime = makeRuntime(registry, store);

    await runtime.start({
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_original",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.wait_then_done",
      input: {},
      now: "2026-05-31T00:01:00.000Z"
    });

    expect(store.getRunAttempt("run_original")?.status).toBe("waiting");

    await runtime.resume({
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_resumed",
      signal: { signalId: "sig_1", kind: "control_action", payload: { action: "resume" } },
      workspaceId: "ws_1",
      now: "2026-05-31T00:02:00.000Z"
    });

    // Original attempt still waiting, new attempt succeeded
    expect(store.getRunAttempt("run_original")?.status).toBe("waiting");
    expect(store.getRunAttempt("run_resumed")?.status).toBe("succeeded");
  });
});
