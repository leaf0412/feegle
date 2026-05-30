import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ArtifactService } from "../../src/artifacts/artifact-service.js";
import { ArtifactStore } from "../../src/artifacts/artifact-store.js";
import { RecoveryService } from "../../src/recovery/recovery-service.js";

describe("RecoveryService", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-recovery-"));
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

  it("creates a diagnostic bundle artifact before recovery work starts", async () => {
    const recovery = new RecoveryService(
      new ArtifactService(new ArtifactStore(db), join(tempDir, "artifacts"))
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
});
