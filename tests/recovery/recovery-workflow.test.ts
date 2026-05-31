import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { ArtifactService } from "@core/artifacts/artifact-service.js";
import { ArtifactStore } from "@core/artifacts/artifact-store.js";
import { ControlActionStore } from "@core/control/control-action-store.js";
import { MemoryStore } from "@core/memory/memory-store.js";
import { RecoveryService } from "@core/recovery/recovery-service.js";
import {
  classifyFailure,
  createRecoveryWorkflow
} from "@core/recovery/recovery-workflow.js";
import {
  normalizeTarget,
  type RecoveryTarget
} from "@core/recovery/recovery-target.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "@core/runtime/runtime-effect-executor.js";
import type { RuntimeError } from "@core/runtime/runtime-models.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";

describe("classifyFailure", () => {
  it("classifies validation errors as non-recoverable", () => {
    const result = classifyFailure({
      code: "BAD_INPUT",
      category: "validation",
      message: "invalid",
      retryable: false,
      recoverable: false
    });
    expect(result).toEqual({ kind: "non_recoverable", reason: "validation: invalid" });
  });

  it("classifies agent_process errors as recoverable", () => {
    const result = classifyFailure({
      code: "AGENT_FAILED",
      category: "agent_process",
      message: "agent died",
      retryable: false,
      recoverable: true
    });
    expect(result).toEqual({
      kind: "recoverable",
      category: "agent_process",
      suggestion: "restart agent or retry"
    });
  });

  it("classifies recoverable capability errors as recoverable", () => {
    const result = classifyFailure({
      code: "EFFECT_FAILED",
      category: "capability",
      message: "boom",
      retryable: false,
      recoverable: true
    });
    expect(result.kind).toBe("recoverable");
    expect((result as { kind: "recoverable"; category: string }).category).toBe("capability");
  });

  it("classifies unknown errors by default", () => {
    const result = classifyFailure({
      code: "UNKNOWN",
      category: "unknown",
      message: "???",
      retryable: false,
      recoverable: false
    });
    expect(result.kind).toBe("unknown");
  });
});

describe("Recovery Workflow", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: RuntimeStore;
  let memoryStore: MemoryStore;
  let controlActionStore: ControlActionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-recovery-workflow-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    store = new RuntimeStore(db);
    memoryStore = new MemoryStore(db);
    controlActionStore = new ControlActionStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeRuntime() {
    const registry = new WorkflowRegistry();
    const artifactStore = new ArtifactStore(db);
    const artifactService = new ArtifactService(artifactStore, join(tempDir, "artifacts"));
    const recoveryService = new RecoveryService(artifactService, store, artifactStore, memoryStore);

    registry.register(
      createRecoveryWorkflow({ recoveryService, memoryStore, controlActionStore })
    );

    return new WorkflowRuntime(store, registry, new RuntimeEffectExecutor(store, new EffectHandlerRegistry()));
  }

  it("collects diagnostics and classifies a recoverable failure", async () => {
    const runtime = makeRuntime();

    const result = await runtime.start({
      workflowInstanceId: "wfi_recovery",
      runAttemptId: "run_recovery",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "core.recovery.workflow",
      input: {
        workspaceId: "ws_1",
        runAttemptId: "run_failed",
        error: {
          code: "AGENT_FAILED",
          category: "agent_process" as const,
          message: "agent died",
          retryable: false,
          recoverable: true
        },
        now: "2026-05-31T00:01:00.000Z"
      },
      now: "2026-05-31T00:01:00.000Z"
    });

    expect(result.status).toBe("succeeded");

    const events = store.listRuntimeEvents("wfi_recovery");
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("workflow_instance.created");
  });

  it("produces 'none' action for non-recoverable errors", async () => {
    const runtime = makeRuntime();
    const nonRecoverableError: RuntimeError = {
      code: "BAD_INPUT",
      category: "validation",
      message: "invalid input",
      retryable: false,
      recoverable: false
    };

    const result = await runtime.start({
      workflowInstanceId: "wfi_nonrecov",
      runAttemptId: "run_nonrecov",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "core.recovery.workflow",
      input: {
        workspaceId: "ws_1",
        error: nonRecoverableError,
        now: "2026-05-31T00:02:00.000Z"
      },
      now: "2026-05-31T00:02:00.000Z"
    });

    expect(result.status).toBe("succeeded");
  });

  it("enters waiting state when recovery requires approval", async () => {
    const runtime = makeRuntime();
    const unknownError: RuntimeError = {
      code: "MYSTERY",
      category: "unknown",
      message: "something went wrong",
      retryable: false,
      recoverable: false
    };

    const result = await runtime.start({
      workflowInstanceId: "wfi_approval",
      runAttemptId: "run_approval",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "core.recovery.workflow",
      input: {
        workspaceId: "ws_1",
        runAttemptId: "run_bad",
        error: unknownError,
        now: "2026-05-31T00:03:00.000Z"
      },
      now: "2026-05-31T00:03:00.000Z"
    });

    // Unknown errors with non-recoverable classification trigger approval
    expect(result.status).toBe("waiting");

    // Verify a control action was created
    const pendingActions = controlActionStore.listPending("ws_1");
    expect(pendingActions.length).toBeGreaterThan(0);
  });

  it("retry action completes full path through execute and record_memory", async () => {
    const runtime = makeRuntime();
    const recoverableError: RuntimeError = {
      code: "AGENT_FAILED",
      category: "agent_process",
      message: "agent died",
      retryable: false,
      recoverable: true
    };

    const result = await runtime.start({
      workflowInstanceId: "wfi_full",
      runAttemptId: "run_full",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "core.recovery.workflow",
      input: {
        workspaceId: "ws_1",
        runAttemptId: "run_failed",
        error: recoverableError,
        now: "2026-05-31T00:10:00.000Z"
      },
      now: "2026-05-31T00:10:00.000Z"
    });

    expect(result.status).toBe("succeeded");

    const events = store.listRuntimeEvents("wfi_full");
    const stepEventTypes = events
      .filter((e) => e.type.startsWith("step."))
      .map((e) => e.type);
    expect(stepEventTypes).toContain("step.started");
    expect(stepEventTypes).toContain("step.succeeded");
  });

  it("recovery workflow creates memory candidate on completion", async () => {
    const runtime = makeRuntime();
    const recoverableError: RuntimeError = {
      code: "EFFECT_FAILED",
      category: "capability",
      message: "handler unavailable",
      retryable: false,
      recoverable: true
    };

    const result = await runtime.start({
      workflowInstanceId: "wfi_memory",
      runAttemptId: "run_memory",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "core.recovery.workflow",
      input: {
        workspaceId: "ws_1",
        runAttemptId: "run_orig",
        error: recoverableError,
        now: "2026-05-31T00:11:00.000Z"
      },
      now: "2026-05-31T00:11:00.000Z"
    });

    expect(result.status).toBe("succeeded");

    const activeMemories = memoryStore.listActive("ws_1");
    const failurePatterns = activeMemories.filter((m) => m.kind === "failure_pattern");
    expect(failurePatterns.length).toBeGreaterThan(0);
    expect(failurePatterns[0].content).toContain("Recovery action");
  });

  it("control action for trigger_recovery is created when approval needed", async () => {
    const runtime = makeRuntime();
    const unknownError: RuntimeError = {
      code: "MYSTERY",
      category: "unknown",
      message: "something went wrong",
      retryable: false,
      recoverable: false
    };

    const result = await runtime.start({
      workflowInstanceId: "wfi_ctrl",
      runAttemptId: "run_ctrl",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "core.recovery.workflow",
      input: {
        workspaceId: "ws_1",
        runAttemptId: "run_bad",
        error: unknownError,
        now: "2026-05-31T00:12:00.000Z"
      },
      now: "2026-05-31T00:12:00.000Z"
    });

    expect(result.status).toBe("waiting");

    const pendingActions = controlActionStore.listPending("ws_1");
    const recoveryAction = pendingActions.find((a) => a.actionType === "trigger_recovery");
    expect(recoveryAction).toBeDefined();
    expect(recoveryAction!.payload).toHaveProperty("artifactId");
    expect(recoveryAction!.status).toBe("pending");
  });

  it("recovery workflow resumes from approval signal and completes", async () => {
    const runtime = makeRuntime();
    const unknownError: RuntimeError = {
      code: "MYSTERY",
      category: "unknown",
      message: "something went wrong",
      retryable: false,
      recoverable: false
    };

    const result1 = await runtime.start({
      workflowInstanceId: "wfi_resume",
      runAttemptId: "run_resume_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "core.recovery.workflow",
      input: {
        workspaceId: "ws_1",
        runAttemptId: "run_orig_bad",
        error: unknownError,
        now: "2026-05-31T00:13:00.000Z"
      },
      now: "2026-05-31T00:13:00.000Z"
    });

    expect(result1.status).toBe("waiting");

    const pendingActions = controlActionStore.listPending("ws_1");
    const recoveryAction = pendingActions.find((a) => a.actionType === "trigger_recovery");
    expect(recoveryAction).toBeDefined();

    const result2 = await runtime.resume({
      workflowInstanceId: "wfi_resume",
      runAttemptId: "run_resume_2",
      signal: {
        signalId: "sig_approve_recovery",
        kind: "control_action",
        payload: { action: "trigger_recovery" },
        actor: { kind: "user", userId: "user_1" }
      },
      workspaceId: "ws_1",
      now: "2026-05-31T00:14:00.000Z"
    });

    expect(result2.status).toBe("succeeded");

    const events = store.listRuntimeEvents("wfi_resume");
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toContain("step.waiting");
    expect(eventTypes).toContain("workflow.signal_received");
    expect(eventTypes).toContain("attempt.completed");
    expect(eventTypes).toContain("workflow_instance.state_changed");
  });
});

describe("Recovery Target", () => {
  it("normalizes failed_attempt target", () => {
    const target: RecoveryTarget = {
      kind: "failed_attempt",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      error: {
        code: "AGENT_FAILED",
        category: "agent_process",
        message: "agent died",
        retryable: false,
        recoverable: true
      }
    };

    const normalized = normalizeTarget(target);
    expect(normalized.workflowInstanceId).toBe("wfi_1");
    expect(normalized.runAttemptId).toBe("run_1");
    expect(normalized.error).toBeDefined();
    expect(normalized.error!.code).toBe("AGENT_FAILED");
  });

  it("normalizes failed_step target", () => {
    const target: RecoveryTarget = {
      kind: "failed_step",
      workflowInstanceId: "wfi_2",
      runAttemptId: "run_2",
      stepStateId: "step_1",
      error: {
        code: "STEP_FAILED",
        category: "unknown",
        message: "step error",
        retryable: false,
        recoverable: false
      }
    };

    const normalized = normalizeTarget(target);
    expect(normalized.workflowInstanceId).toBe("wfi_2");
    expect(normalized.runAttemptId).toBe("run_2");
    expect(normalized.error!.code).toBe("STEP_FAILED");
  });

  it("normalizes stuck_workflow target (no error)", () => {
    const target: RecoveryTarget = {
      kind: "stuck_workflow",
      workflowInstanceId: "wfi_3",
      runAttemptId: "run_3",
      stuckSince: "2026-05-31T00:00:00.000Z"
    };

    const normalized = normalizeTarget(target);
    expect(normalized.workflowInstanceId).toBe("wfi_3");
    expect(normalized.runAttemptId).toBe("run_3");
    expect(normalized.error).toBeUndefined();
    expect(normalized.stuckSince).toBe("2026-05-31T00:00:00.000Z");
  });

  it("normalizes failed_effect target", () => {
    const target: RecoveryTarget = {
      kind: "failed_effect",
      workflowInstanceId: "wfi_4",
      runAttemptId: "run_4",
      effectExecutionId: "eff_1",
      error: {
        code: "EFFECT_FAILED",
        category: "capability",
        message: "effect failed",
        retryable: true,
        recoverable: true
      }
    };

    const normalized = normalizeTarget(target);
    expect(normalized.workflowInstanceId).toBe("wfi_4");
    expect(normalized.runAttemptId).toBe("run_4");
    expect(normalized.error!.code).toBe("EFFECT_FAILED");
  });
});
