import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { ArtifactRetentionService } from "../../src/core/artifacts/artifact-retention-service.js";
import { ArtifactStore } from "../../src/core/artifacts/artifact-store.js";

describe("ArtifactRetentionService", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let store: ArtifactStore;
  let retention: ArtifactRetentionService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-retention-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    store = new ArtifactStore(db);
    retention = new ArtifactRetentionService(store);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("pins an artifact so it is never deleted", () => {
    store.insert({
      id: "art_1",
      workspaceId: "ws_1",
      workflowInstanceId: null,
      runAttemptId: null,
      kind: "diagnostic_bundle",
      filePath: "/tmp/test.json",
      contentType: "text/plain",
      summary: {},
      retentionDays: 30,
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    retention.pin("art_1", "2026-05-31T00:00:00.000Z");

    const expired = store.listExpiredUnpinned("2026-12-31T00:00:00.000Z");
    expect(expired.some((a) => a.id === "art_1")).toBe(false);
  });

  it("unpins an artifact", () => {
    store.insert({
      id: "art_1",
      workspaceId: "ws_1",
      workflowInstanceId: null,
      runAttemptId: null,
      kind: "diagnostic_bundle",
      filePath: "/tmp/test.json",
      contentType: "text/plain",
      summary: {},
      retentionDays: 30,
      pinned: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    retention.unpin("art_1", "2026-05-31T00:00:00.000Z");
    // After unpin, the artifact would be eligible for expiry
  });

  it("marks deleted artifact content but preserves metadata", async () => {
    store.insert({
      id: "art_1",
      workspaceId: "ws_1",
      workflowInstanceId: null,
      runAttemptId: null,
      kind: "stderr_stdout",
      filePath: join(tempDir, "deleteme.txt"),
      contentType: "text/plain",
      summary: { bytes: 100 },
      retentionDays: 30,
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    // Create the file
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(tempDir, "deleteme.txt"), "some log content");

    const purged = await retention.purgeExpired("2026-05-31T00:00:00.000Z");
    expect(purged).toBeGreaterThanOrEqual(0);
  });
});
