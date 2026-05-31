import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { MemoryStore } from "../../src/core/memory/memory-store.js";

describe("MemoryStore", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-memory-"));
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

  it("creates workspace memory as a pending candidate by default", () => {
    const store = new MemoryStore(db);
    const record = store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "Workspace memory requires approval.",
      source: { runAttemptId: "run_1" },
      confidence: 0.8,
      now: "2026-05-30T00:00:00.000Z"
    });

    expect(record.status).toBe("pending_approval");
  });

  it("approves a pending candidate to active", () => {
    const store = new MemoryStore(db);
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "needs approval",
      source: {},
      confidence: 0.9,
      now: "2026-05-30T00:00:00.000Z"
    });

    store.approve("mem_1", "2026-05-30T00:01:00.000Z");

    const record = store.getById("mem_1");
    expect(record?.status).toBe("active");
  });

  it("rejects a pending candidate", () => {
    const store = new MemoryStore(db);
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "needs approval",
      source: {},
      confidence: 0.9,
      now: "2026-05-30T00:00:00.000Z"
    });

    store.reject("mem_1", "2026-05-30T00:01:00.000Z");

    const record = store.getById("mem_1");
    expect(record?.status).toBe("rejected");
  });

  it("lists only active memory", () => {
    const store = new MemoryStore(db);
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "run",
      kind: "fact",
      content: "active by default",
      source: {},
      confidence: 1,
      now: "2026-05-30T00:00:00.000Z"
    });
    store.createCandidate({
      id: "mem_2",
      workspaceId: "ws_1",
      scope: "workspace",
      kind: "decision",
      content: "pending",
      source: {},
      confidence: 0.5,
      now: "2026-05-30T00:00:00.000Z"
    });

    const active = store.listActive("ws_1");
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe("mem_1");
  });

  it("deletes a memory record", () => {
    const store = new MemoryStore(db);
    store.createCandidate({
      id: "mem_1",
      workspaceId: "ws_1",
      scope: "run",
      kind: "fact",
      content: "temp",
      source: {},
      confidence: 1,
      now: "2026-05-30T00:00:00.000Z"
    });

    store.delete("mem_1");
    expect(store.getById("mem_1")).toBeUndefined();
  });
});
