import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ArtifactService } from "../../src/core/artifacts/artifact-service.js";
import { ArtifactStore } from "../../src/core/artifacts/artifact-store.js";

describe("ArtifactService", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-artifacts-"));
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

  it("stores artifact metadata in SQLite and content on disk", async () => {
    const service = new ArtifactService(new ArtifactStore(db), join(tempDir, "artifacts"));

    const artifact = await service.writeTextArtifact({
      artifactId: "art_1",
      workspaceId: "ws_1",
      kind: "diagnostic_bundle",
      fileName: "art_1.json",
      content: JSON.stringify({ ok: true }),
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(readFileSync(artifact.filePath, "utf8")).toBe(JSON.stringify({ ok: true }));
    expect(artifact.retentionDays).toBe(90);
  });
});
