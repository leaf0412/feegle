import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { MemoryStore } from "../../src/memory/memory-store.js";

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
});
