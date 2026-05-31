import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ArtifactService } from "../../src/core/artifacts/artifact-service.js";
import { ArtifactStore } from "../../src/core/artifacts/artifact-store.js";
import { MemoryStore } from "../../src/core/memory/memory-store.js";
import { RuntimeStore } from "../../src/core/runtime/runtime-store.js";
import { RecoveryService } from "../../src/core/recovery/recovery-service.js";

describe("DiagnosticBundle (via RecoveryService)", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-diagnostics-"));
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

  function makeRecovery() {
    const artifactStore = new ArtifactStore(db);
    return new RecoveryService(
      new ArtifactService(artifactStore, join(tempDir, "artifacts")),
      new RuntimeStore(db),
      artifactStore,
      new MemoryStore(db)
    );
  }

  it("produces ordered runtime event timeline", async () => {
    const now = "2026-05-31T00:01:00.000Z";
    const runtimeStore = new RuntimeStore(db);
    runtimeStore.createWorkflowInstance({
      id: "wfi_1", workspaceId: "ws_1", projectId: null,
      definitionId: "test.wf", definitionVersion: 1, status: "failed", now
    });
    runtimeStore.createRunAttempt({
      id: "run_1", workflowInstanceId: "wfi_1", status: "failed", triggerEventId: null, now
    });
    runtimeStore.appendRuntimeEvent({
      id: "evt_a", workspaceId: "ws_1", workflowInstanceId: "wfi_1", runAttemptId: "run_1",
      stepStateId: null, effectExecutionId: null, category: "required",
      type: "attempt.started", payload: {}, now
    });
    runtimeStore.appendRuntimeEvent({
      id: "evt_b", workspaceId: "ws_1", workflowInstanceId: "wfi_1", runAttemptId: "run_1",
      stepStateId: null, effectExecutionId: null, category: "required",
      type: "effect.started", payload: { effectId: "eff_1" }, now
    });
    runtimeStore.appendRuntimeEvent({
      id: "evt_c", workspaceId: "ws_1", workflowInstanceId: "wfi_1", runAttemptId: "run_1",
      stepStateId: null, effectExecutionId: null, category: "required",
      type: "effect.failed", payload: { errorCode: "ERR" }, now
    });

    const recovery = makeRecovery();
    const artifact = await recovery.createDiagnosticBundle({
      artifactId: "diag_timeline",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_1",
      runAttemptId: "run_1",
      error: {
        code: "AGENT_FAILED", category: "agent_process", message: "x",
        retryable: false, recoverable: true
      },
      now
    });

    const { readFileSync } = await import("node:fs");
    const content = JSON.parse(readFileSync(artifact.filePath, "utf8"));
    const types = content.timeline.map((t: { type: string }) => t.type);
    expect(types).toEqual(["attempt.started", "effect.started", "effect.failed"]);
  });

  it("leaves related artifacts and memory as empty arrays when none exist", async () => {
    const now = "2026-05-31T00:02:00.000Z";
    const runtimeStore = new RuntimeStore(db);
    runtimeStore.createWorkflowInstance({
      id: "wfi_2", workspaceId: "ws_1", projectId: null,
      definitionId: "test.wf", definitionVersion: 1, status: "failed", now
    });
    runtimeStore.createRunAttempt({
      id: "run_2", workflowInstanceId: "wfi_2", status: "failed", triggerEventId: null, now
    });

    const recovery = makeRecovery();
    const artifact = await recovery.createDiagnosticBundle({
      artifactId: "diag_empty",
      workspaceId: "ws_1",
      workflowInstanceId: "wfi_2",
      runAttemptId: "run_2",
      error: {
        code: "AGENT_FAILED", category: "agent_process", message: "x",
        retryable: false, recoverable: true
      },
      now
    });

    const { readFileSync } = await import("node:fs");
    const content = JSON.parse(readFileSync(artifact.filePath, "utf8"));
    expect(content.relatedArtifacts).toEqual([]);
    expect(content.relatedMemory).toEqual([]);
    expect(content.environmentSummary.nodeVersion).toBeTruthy();
  });
});
