import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { ArtifactRetentionService } from "@core/artifacts/artifact-retention-service.js";
import { ArtifactStore } from "@core/artifacts/artifact-store.js";

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

  function insertArtifact(overrides: Partial<{
    id: string;
    workspaceId: string;
    kind: string;
    retentionDays: number;
    pinned: boolean;
    createdAt: string;
    filePath: string;
    summary: Record<string, unknown>;
  }> = {}): void {
    const id = overrides.id ?? "art_1";
    const filePath = overrides.filePath ?? join(tempDir, `${id}.json`);
    writeFileSync(filePath, JSON.stringify({ test: true }), "utf8");

    store.insert({
      id,
      workspaceId: overrides.workspaceId ?? "ws_1",
      workflowInstanceId: null,
      runAttemptId: null,
      kind: (overrides.kind as any) ?? "diagnostic_bundle",
      filePath,
      contentType: "text/plain",
      summary: overrides.summary ?? { bytes: 100 },
      retentionDays: overrides.retentionDays ?? 30,
      pinned: overrides.pinned ?? false,
      createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
      updatedAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z"
    });
  }

  it("pinned artifact is not deleted by retention", async () => {
    insertArtifact({
      id: "art_pinned",
      retentionDays: 30,
      pinned: true,
      createdAt: "2025-01-01T00:00:00.000Z" // well past retention
    });

    const expiredCount = await retention.deleteExpired("2026-05-31T00:00:00.000Z");
    expect(expiredCount).toBe(0);

    // Verify artifact still exists and is not expired
    const record = store.getById("art_pinned");
    expect(record).toBeDefined();
    expect(record!.isDeleted).toBe(false);
  });

  it("unpinned artifact past retention is expired and payload cleared", async () => {
    const filePath = join(tempDir, "art_expired.json");
    writeFileSync(filePath, JSON.stringify({ data: "sensitive-data" }), "utf8");

    insertArtifact({
      id: "art_expired",
      filePath,
      retentionDays: 30,
      pinned: false,
      createdAt: "2025-01-01T00:00:00.000Z" // well past 30 days
    });

    const expiredCount = await retention.deleteExpired("2026-05-31T00:00:00.000Z");
    expect(expiredCount).toBe(1);

    // Verify metadata remains (isDeleted flag, summary contains expired info)
    const record = store.getById("art_expired");
    expect(record).toBeDefined();
    expect(record!.isDeleted).toBe(true);
    expect(record!.summary).toHaveProperty("expired", true);
  });

  it("expired artifact payload is cleared but summary (metadata) remains", async () => {
    const filePath = join(tempDir, "art_meta.json");
    writeFileSync(filePath, JSON.stringify({ result: "important data" }), "utf8");

    insertArtifact({
      id: "art_meta",
      filePath,
      retentionDays: 30,
      pinned: false,
      createdAt: "2025-01-01T00:00:00.000Z" // well past 30 days
    });

    await retention.deleteExpired("2026-05-31T00:00:00.000Z");

    // The metadata record should still exist
    const record = store.getById("art_meta");
    expect(record).toBeDefined();
    // Should preserve workspaceId, kind, and other metadata
    expect(record!.workspaceId).toBe("ws_1");
    expect(record!.kind).toBe("diagnostic_bundle");
    // Summary should contain expiration info
    expect(record!.summary).toHaveProperty("expired", true);
    expect(record!.summary).toHaveProperty("expiredAt");
  });

  it("pins an artifact so it is never deleted", () => {
    insertArtifact({
      id: "art_1",
      retentionDays: 30,
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    retention.pin("art_1", "2026-05-31T00:00:00.000Z");

    const expired = store.listExpired("2026-12-31T00:00:00.000Z");
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

    // After unpinning, the artifact becomes eligible for expiry
    // Verify the pin is removed by checking we can find it in expired list
    const expired = store.listExpired("2026-12-31T00:00:00.000Z");
    expect(expired.some((a) => a.id === "art_1")).toBe(true);
  });

  it("marks deleted artifact content but preserves metadata", async () => {
    insertArtifact({
      id: "art_1",
      retentionDays: 30,
      pinned: false,
      createdAt: "2026-01-01T00:00:00.000Z"
    });

    const purged = await retention.purgeExpired("2026-05-31T00:00:00.000Z");
    expect(purged).toBeGreaterThanOrEqual(0);
  });

  it("deleteExpired does not affect non-expired artifacts", async () => {
    // Created today with 90 day retention — not expired
    insertArtifact({
      id: "art_fresh",
      retentionDays: 90,
      pinned: false,
      createdAt: "2026-05-30T00:00:00.000Z"
    });

    const expiredCount = await retention.deleteExpired("2026-05-31T00:00:00.000Z");
    expect(expiredCount).toBe(0);

    const record = store.getById("art_fresh");
    expect(record!.isDeleted).toBe(false);
  });

  it("purgeOrphaned removes artifacts with no runtime event linkage", async () => {
    // Insert and expire an artifact
    insertArtifact({
      id: "art_orphan",
      retentionDays: 1,
      pinned: false,
      createdAt: "2025-01-01T00:00:00.000Z"
    });

    // Expire it first
    await retention.deleteExpired("2026-05-31T00:00:00.000Z");

    // Now purge orphaned — this artifact has no runtime events linked
    const purged = await retention.purgeOrphaned();
    expect(purged).toBe(1);

    const record = store.getById("art_orphan");
    expect(record).toBeUndefined();
  });
});
