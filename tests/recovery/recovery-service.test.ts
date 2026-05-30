import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ArtifactService } from "../../src/artifacts/artifact-service.js";
import { ArtifactStore } from "../../src/artifacts/artifact-store.js";
import { MemoryStore } from "../../src/memory/memory-store.js";
import { RuntimeStore } from "../../src/runtime/runtime-store.js";
import { RecoveryService } from "../../src/recovery/recovery-service.js";

describe("RecoveryService", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let runtimeStore: RuntimeStore;
  let artifactStore: ArtifactStore;
  let memoryStore: MemoryStore;
  let artifactService: ArtifactService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-recovery-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    runtimeStore = new RuntimeStore(db);
    artifactStore = new ArtifactStore(db);
    memoryStore = new MemoryStore(db);
    artifactService = new ArtifactService(artifactStore, join(tempDir, "artifacts"));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a diagnostic bundle artifact before recovery work starts", async () => {
    const recovery = new RecoveryService(
      artifactService,
      runtimeStore,
      artifactStore,
      memoryStore
    );

    const artifact = await recovery.createDiagnosticBundle({
      artifactId: "diag_1",
      workspaceId: "ws_1",
      runAttemptId: "run_1",
      error: {
        code: "AGENT_FAILED",
        category: "agent_process",
        message: "agent exited non-zero",
        retryable: false,
        recoverable: true
      },
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(artifact.kind).toBe("diagnostic_bundle");
  });

  it("includes runtime event timeline in diagnostic bundle", async () => {
    const now = "2026-05-31T00:01:00.000Z";

    // Create a workflow instance with events
    runtimeStore.createWorkflowInstance({
      id: "wfi_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.workflow",
      definitionVersion: 1,
      status: "failed",
      now
    });
    runtimeStore.createRunAttempt({
      id: "run_1",
      workflowInstanceId: "wfi_1",
      status: "failed",
      triggerEventId: null,
      now
    });
    runtimeStore.appendRuntimeEvent({
      id: "evt_1",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      stepStateId: null,
      effectExecutionId: null,
      category: "required",
      type: "attempt.started",
      payload: {},
      now
    });
    runtimeStore.appendRuntimeEvent({
      id: "evt_2",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      stepStateId: null,
      effectExecutionId: null,
      category: "required",
      type: "attempt.failed",
      payload: { errorCode: "AGENT_FAILED" },
      now
    });

    const recovery = new RecoveryService(
      artifactService,
      runtimeStore,
      artifactStore,
      memoryStore
    );

    const artifact = await recovery.createDiagnosticBundle({
      artifactId: "diag_2",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      error: {
        code: "AGENT_FAILED",
        category: "agent_process",
        message: "agent died",
        retryable: false,
        recoverable: true
      },
      now
    });

    expect(artifact.kind).toBe("diagnostic_bundle");

    // Read the file and verify content
    const { readFileSync } = await import("node:fs");
    const content = JSON.parse(readFileSync(artifact.filePath, "utf8"));
    expect(content.timeline).toHaveLength(2);
    expect(content.timeline.map((t: { type: string }) => t.type)).toContain("attempt.started");
    expect(content.timeline.map((t: { type: string }) => t.type)).toContain("attempt.failed");
  });

  it("collects failed effects in diagnostic bundle", async () => {
    const now = "2026-05-31T00:02:00.000Z";

    runtimeStore.createWorkflowInstance({
      id: "wfi_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.workflow",
      definitionVersion: 1,
      status: "failed",
      now
    });
    runtimeStore.createRunAttempt({
      id: "run_2",
      workflowInstanceId: "wfi_2",
      status: "failed",
      triggerEventId: null,
      now
    });
    runtimeStore.createEffectExecution({
      id: "eff_1",
      runAttemptId: "run_2",
      stepStateId: null,
      pluginId: "test",
      effectType: "greet",
      status: "failed",
      idempotencyKey: null,
      inputSummary: {},
      now
    });
    runtimeStore.updateEffectExecution({
      id: "eff_1",
      status: "failed",
      outputSummary: null,
      error: {
        code: "EFFECT_FAILED",
        category: "capability",
        message: "boom",
        retryable: false,
        recoverable: false
      },
      now
    });

    const recovery = new RecoveryService(
      artifactService,
      runtimeStore,
      artifactStore,
      memoryStore
    );

    const artifact = await recovery.createDiagnosticBundle({
      artifactId: "diag_3",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_2",
      runAttemptId: "run_2",
      error: {
        code: "AGENT_FAILED",
        category: "agent_process",
        message: "died",
        retryable: false,
        recoverable: true
      },
      now
    });

    const { readFileSync } = await import("node:fs");
    const content = JSON.parse(readFileSync(artifact.filePath, "utf8"));
    expect(content.failedEffects).toHaveLength(1);
    expect(content.failedEffects[0].effectExecutionId).toBe("eff_1");
    expect(content.failedEffects[0].pluginId).toBe("test");
    expect(content.failedEffects[0].effectType).toBe("greet");
  });
});
