import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "@core/runtime/runtime-effect-executor.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";
import { MemoryService } from "@core/memory/memory-service.js";
import { MemoryStore } from "@core/memory/memory-store.js";
import { PolicyService, type MembershipChecker } from "@core/security/policy-service.js";

function denyingChecker(): MembershipChecker {
  return () => false;
}

function allowingChecker(): MembershipChecker {
  return () => true;
}

describe("Policy boundary enforcement - step denial", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: RuntimeStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-policy-step-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    store = new RuntimeStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("step execution denied by policy - step skipped with event", async () => {
    const policyService = new PolicyService(denyingChecker());
    const registry = new WorkflowRegistry();
    let stepRunCalled = false;

    registry.register({
      definitionId: "test.denied_step",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [{
        stepId: "sensitive_op",
        run: () => {
          stepRunCalled = true;
          return { kind: "complete", output: { ok: true } };
        }
      }]
    });

    const runtime = new WorkflowRuntime(
      store,
      registry,
      new RuntimeEffectExecutor(store, new EffectHandlerRegistry()),
      undefined,
      policyService
    );

    const result = await runtime.start({
      workflowInstanceId: "wfi_denied",
      runAttemptId: "run_denied",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.denied_step",
      input: { message: "hello" },
      now: "2026-05-31T00:01:00.000Z",
      actor: "user_evil"
    });

    // Step execution should be denied
    expect(result.status).toBe("failed");
    expect(result.reason).toContain("not authorized");
    // Step must NOT have run
    expect(stepRunCalled).toBe(false);

    // Step state should be recorded as skipped
    const stepSummaries = store.listStepSummaries("wfi_denied");
    expect(stepSummaries).toHaveLength(1);
    expect(stepSummaries[0].status).toBe("skipped");

    // Verify step state was recorded with correct ID pattern
    const stepState = store.getStepState(stepSummaries[0].id);
    expect(stepState?.status).toBe("skipped");

    // Denial event should be recorded
    const events = store.listRuntimeEvents("wfi_denied");
    const deniedEvents = events.filter((e) => e.type === "step.denied");
    expect(deniedEvents).toHaveLength(1);
    expect((deniedEvents[0].payload as Record<string, unknown>).stepId).toBe("sensitive_op");
  });

  it("step allowed when actor is known member", async () => {
    const policyService = new PolicyService(allowingChecker());
    const registry = new WorkflowRegistry();

    registry.register({
      definitionId: "test.allowed_step",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [{
        stepId: "safe_op",
        run: () => ({ kind: "complete", output: { ok: true } })
      }]
    });

    const runtime = new WorkflowRuntime(
      store,
      registry,
      new RuntimeEffectExecutor(store, new EffectHandlerRegistry()),
      undefined,
      policyService
    );

    const result = await runtime.start({
      workflowInstanceId: "wfi_allowed",
      runAttemptId: "run_allowed",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.allowed_step",
      input: {},
      now: "2026-05-31T00:01:00.000Z",
      actor: "user_good"
    });

    expect(result.status).toBe("succeeded");
  });

  it("step allowed when no policy service is configured", async () => {
    const registry = new WorkflowRegistry();

    registry.register({
      definitionId: "test.no_policy",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [{
        stepId: "unprotected",
        run: () => ({ kind: "complete", output: { ok: true } })
      }]
    });

    // No policy service at all
    const runtime = new WorkflowRuntime(
      store,
      registry,
      new RuntimeEffectExecutor(store, new EffectHandlerRegistry())
    );

    const result = await runtime.start({
      workflowInstanceId: "wfi_no_policy",
      runAttemptId: "run_no_policy",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.no_policy",
      input: {},
      now: "2026-05-31T00:01:00.000Z"
    });

    expect(result.status).toBe("succeeded");
  });
});

describe("Policy boundary enforcement - effect denial", () => {
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
    tempDir = mkdtempSync(join(tmpdir(), "feegle-policy-effect-"));
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

  it("effect execution denied by policy - error thrown, effect not invoked", async () => {
    const policyService = new PolicyService(denyingChecker());
    let handlerCalled = false;

    handlers.register({
      pluginId: "test",
      effectType: "send_notification",
      execute: async () => {
        handlerCalled = true;
        return { sent: true };
      }
    });

    seedRun("run_deny", "wfi_deny", "step_deny", "2026-05-31T00:01:00.000Z");

    const executor = new RuntimeEffectExecutor(store, handlers, policyService);

    const error = await expect(
      executor.execute({
        effectId: "eff_deny",
        pluginId: "test",
        effectType: "send_notification",
        input: { to: "someone" },
        workspaceId: "ws_1",
        workflowInstanceId: "wfi_deny",
        runAttemptId: "run_deny",
        stepStateId: "step_deny",
        now: "2026-05-31T00:01:00.000Z",
        actor: "user_evil"
      })
    ).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      message: expect.stringContaining("denied by policy")
    });

    // Handler must NOT have been invoked
    expect(handlerCalled).toBe(false);

    // Effect should be recorded as failed
    const effectRecord = store.getEffectExecution("eff_deny");
    expect(effectRecord?.status).toBe("failed");

    // Effect started and failed events should be recorded
    const events = store.listRuntimeEvents("wfi_deny");
    const effectEvents = events.filter((e) => e.type.startsWith("effect."));
    expect(effectEvents.map((e) => e.type)).toEqual([
      "effect.started",
      "effect.failed"
    ]);
  });
});

describe("Policy boundary enforcement - memory denial", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: MemoryStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-policy-memory-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    store = new MemoryStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("memory approve denied by policy - error thrown", () => {
    const policyService = new PolicyService(denyingChecker());
    const service = new MemoryService(store, policyService);

    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "Use pnpm",
      source: {},
      confidence: 0.9,
      now: "2026-05-31T00:00:00.000Z"
    });

    const err = expect(() =>
      service.approve("mem_1", "2026-05-31T00:01:00.000Z", "user_evil", "ws_1")
    ).toThrow();

    // Memory status should NOT have changed
    expect(store.getById("mem_1")?.status).toBe("pending_approval");
  });

  it("memory reject denied by policy - error thrown", () => {
    const policyService = new PolicyService(denyingChecker());
    const service = new MemoryService(store, policyService);

    store.createCandidate({
      id: "mem_2",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "Use yarn",
      source: {},
      confidence: 0.5,
      now: "2026-05-31T00:00:00.000Z"
    });

    expect(() =>
      service.reject("mem_2", "2026-05-31T00:01:00.000Z", "user_evil", "ws_1")
    ).toThrow();

    expect(store.getById("mem_2")?.status).toBe("pending_approval");
  });

  it("memory approve allowed when actor is member", () => {
    const policyService = new PolicyService(allowingChecker());
    const service = new MemoryService(store, policyService);

    store.createCandidate({
      id: "mem_3",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "Use npm",
      source: {},
      confidence: 0.9,
      now: "2026-05-31T00:00:00.000Z"
    });

    // Should not throw
    service.approve("mem_3", "2026-05-31T00:01:00.000Z", "user_good", "ws_1");
    expect(store.getById("mem_3")?.status).toBe("active");
  });

  it("unknown actor cannot access memory resources", () => {
    const policyService = new PolicyService(denyingChecker());
    const service = new MemoryService(store, policyService);

    store.createCandidate({
      id: "mem_4",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "secret",
      source: {},
      confidence: 1.0,
      now: "2026-05-31T00:00:00.000Z"
    });

    // Unknown actor trying to approve
    expect(() =>
      service.approve("mem_4", "2026-05-31T00:01:00.000Z", "unknown_actor", "ws_1")
    ).toThrow();

    expect(store.getById("mem_4")?.status).toBe("pending_approval");
  });
});

describe("PolicyService - evaluate and can", () => {
  it("can returns true for system actor", () => {
    const service = new PolicyService(denyingChecker());
    expect(service.can({
      actor: "system",
      action: "step.execute",
      resource: { type: "step", id: "any" },
      workspaceId: "ws_1"
    })).toBe(true);
  });

  it("can returns false for denied actor", () => {
    const service = new PolicyService(denyingChecker());
    expect(service.can({
      actor: "user_evil",
      action: "step.execute",
      resource: { type: "step", id: "any" },
      workspaceId: "ws_1"
    })).toBe(false);
  });

  it("can returns true when no membership checker configured", () => {
    const service = new PolicyService(); // no checker
    expect(service.can({
      actor: "anyone",
      action: "step.execute",
      resource: { type: "step", id: "any" },
      workspaceId: "ws_1"
    })).toBe(true);
  });

  it("evaluate returns deny with reason for unauthorized actor", () => {
    const service = new PolicyService(denyingChecker());
    const result = service.evaluate({
      actor: "user_evil",
      action: "step.execute",
      resource: { type: "step", id: "sensitive_step" },
      workspaceId: "ws_1"
    });

    expect(result.kind).toBe("deny");
    expect("reason" in result && result.reason).toContain("not authorized");
    expect("reason" in result && result.reason).toContain("sensitive_step");
  });

  it("evaluate returns allow for authorized actor", () => {
    const service = new PolicyService(allowingChecker());
    expect(service.evaluate({
      actor: "user_good",
      action: "step.execute",
      resource: { type: "step", id: "any" },
      workspaceId: "ws_1"
    })).toEqual({ kind: "allow" });
  });

  it("can returns true when checker returns true", () => {
    const service = new PolicyService(allowingChecker());
    expect(service.can({
      actor: "user_1",
      action: "effect.execute",
      resource: { type: "effect", id: "eff_1" },
      workspaceId: "ws_1"
    })).toBe(true);
  });
});
