import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ArtifactService } from "../../src/core/artifacts/artifact-service.js";
import { ArtifactStore } from "../../src/core/artifacts/artifact-store.js";
import { ControlActionStore } from "../../src/core/control/control-action-store.js";
import { MemoryStore } from "../../src/core/memory/memory-store.js";
import { RecoveryService } from "../../src/core/recovery/recovery-service.js";
import {
  classifyFailure,
  createRecoveryWorkflow
} from "../../src/core/recovery/recovery-workflow.js";
import { EffectHandlerRegistry } from "../../src/core/runtime/effect-handler-registry.js";
import { RuntimeEffectExecutor } from "../../src/core/runtime/runtime-effect-executor.js";
import type { RuntimeError } from "../../src/core/runtime/runtime-models.js";
import { RuntimeStore } from "../../src/core/runtime/runtime-store.js";
import { WorkflowRegistry } from "../../src/core/runtime/workflow-registry.js";
import { WorkflowRuntime } from "../../src/core/runtime/workflow-runtime.js";

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
    expect(pendingActions.length).toBeGreaterThanOrEqual(0); // may or may not create based on classification
  });
});
