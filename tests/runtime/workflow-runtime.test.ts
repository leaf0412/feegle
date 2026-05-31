import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { EffectHandlerRegistry } from "../../src/core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "../../src/core/runtime/runtime-effect-executor.js";
import { RuntimeStore } from "../../src/core/runtime/runtime-store.js";
import { WorkflowRegistry } from "../../src/core/runtime/workflow-registry.js";
import { WorkflowRuntime } from "../../src/core/runtime/workflow-runtime.js";

describe("WorkflowRuntime", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-workflow-runtime-"));
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

  it("persists an attempt before running a code-defined workflow", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.complete",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [{ stepId: "finish", run: () => ({ kind: "complete", output: { ok: true } }) }]
    });

    const runtime = new WorkflowRuntime(new RuntimeStore(db), registry, new RuntimeEffectExecutor(new RuntimeStore(db), new EffectHandlerRegistry()));
    const result = await runtime.start({
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.complete",
      input: { message: "hello" },
      now: "2026-05-30T00:01:00.000Z"
    });

    expect(result.status).toBe("succeeded");
  });

  it("records step events and final attempt state when a workflow completes", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.complete.with.events",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [{ stepId: "finish", run: () => ({ kind: "complete", output: { ok: true } }) }]
    });

    const store = new RuntimeStore(db);
    const runtime = new WorkflowRuntime(store, registry, new RuntimeEffectExecutor(store, new EffectHandlerRegistry()));
    const result = await runtime.start({
      workflowInstanceId: "wfi_2",
      runAttemptId: "run_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.complete.with.events",
      input: { message: "hello" },
      now: "2026-05-31T00:01:00.000Z"
    });

    expect(result.status).toBe("succeeded");
    expect(store.getRunAttempt("run_2")?.status).toBe("succeeded");
    expect(store.getWorkflowInstance("wfi_2")?.status).toBe("succeeded");
    expect(store.listRuntimeEvents("wfi_2").map((event) => event.type)).toEqual([
      "workflow_instance.created",
      "attempt.started",
      "step.started",
      "step.succeeded",
      "attempt.completed",
      "workflow_instance.state_changed"
    ]);
  });

  it("records waiting state when a step pauses for human input", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.wait",
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
    const runtime = new WorkflowRuntime(store, registry, new RuntimeEffectExecutor(store, new EffectHandlerRegistry()));

    const result = await runtime.start({
      workflowInstanceId: "wfi_wait",
      runAttemptId: "run_wait",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.wait",
      input: {},
      now: "2026-05-31T00:02:00.000Z"
    });

    expect(result.status).toBe("waiting");
    expect(store.getRunAttempt("run_wait")?.status).toBe("waiting");
    expect(store.getWorkflowInstance("wfi_wait")?.status).toBe("waiting");
    expect(store.listRuntimeEvents("wfi_wait").map((event) => event.type)).toContain("step.waiting");
  });

  it("records failure state and normalized runtime error when a step fails", async () => {
    const registry = new WorkflowRegistry();
    registry.register({
      definitionId: "test.fail",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        {
          stepId: "agent",
          run: () => ({
            kind: "fail",
            recoverable: true,
            error: {
              code: "AGENT_FAILED",
              category: "agent_process",
              message: "agent failed",
              retryable: false,
              recoverable: true
            }
          })
        }
      ]
    });
    const store = new RuntimeStore(db);
    const runtime = new WorkflowRuntime(store, registry, new RuntimeEffectExecutor(store, new EffectHandlerRegistry()));

    const result = await runtime.start({
      workflowInstanceId: "wfi_fail",
      runAttemptId: "run_fail",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.fail",
      input: {},
      now: "2026-05-31T00:03:00.000Z"
    });

    expect(result.status).toBe("failed");
    expect(store.getRunAttempt("run_fail")?.status).toBe("failed");
    expect(store.getWorkflowInstance("wfi_fail")?.status).toBe("failed");
    expect(store.listRuntimeEvents("wfi_fail").map((event) => event.type)).toContain("attempt.failed");
  });
});
