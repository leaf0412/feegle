import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, type RuntimeDb } from "@infra/app/runtime-db.js";
import { DedupStore } from "@features/scheduler/dedup-store.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

describe("DedupStore", () => {
  let db: RuntimeDb;
  let store: DedupStore;

  beforeEach(() => {
    db = makeDb();
    store = new DedupStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it("marks a condition once per local date and allows re-mark on a new date", async () => {
    // First mark for a date returns true (mark recorded).
    await expect(store.checkAndMark("task", "sh600519:stop", "2026-05-18")).resolves.toBe(true);
    // Same triple on the same date returns false (already marked — no duplicate).
    await expect(store.checkAndMark("task", "sh600519:stop", "2026-05-18")).resolves.toBe(false);
    // Same triple on a different date returns true (date rolled over → fresh mark).
    await expect(store.checkAndMark("task", "sh600519:stop", "2026-05-19")).resolves.toBe(true);
  });

  it("tracks different condition keys independently for the same task and date", async () => {
    await expect(store.checkAndMark("task", "key-a", "2026-05-18")).resolves.toBe(true);
    await expect(store.checkAndMark("task", "key-b", "2026-05-18")).resolves.toBe(true);
    // Neither blocks the other.
    await expect(store.checkAndMark("task", "key-a", "2026-05-18")).resolves.toBe(false);
    await expect(store.checkAndMark("task", "key-b", "2026-05-18")).resolves.toBe(false);
  });

  it("tracks different task IDs independently for the same condition key and date", async () => {
    await expect(store.checkAndMark("task-1", "key", "2026-05-18")).resolves.toBe(true);
    await expect(store.checkAndMark("task-2", "key", "2026-05-18")).resolves.toBe(true);
    await expect(store.checkAndMark("task-1", "key", "2026-05-18")).resolves.toBe(false);
    await expect(store.checkAndMark("task-2", "key", "2026-05-18")).resolves.toBe(false);
  });

  it("prunes stale-date rows when a new date is marked so the table stays bounded", async () => {
    await store.checkAndMark("task", "key", "2026-05-18");

    const countBefore = (db.prepare(`select count(*) as n from dedup_keys`).get() as { n: number }).n;
    expect(countBefore).toBe(1);

    // Marking on a new date should insert the new row and delete the old one.
    await store.checkAndMark("task", "key", "2026-05-19");

    const countAfter = (db.prepare(`select count(*) as n from dedup_keys`).get() as { n: number }).n;
    expect(countAfter).toBe(1);

    const row = db
      .prepare(`select date_in_tz from dedup_keys where task_id = 'task'`)
      .get() as { date_in_tz: string } | undefined;
    expect(row?.date_in_tz).toBe("2026-05-19");
  });

  it("clearAll removes every row so subsequent marks succeed as if fresh", async () => {
    await store.checkAndMark("task", "key", "2026-05-18");
    await store.clearAll();

    const count = (db.prepare(`select count(*) as n from dedup_keys`).get() as { n: number }).n;
    expect(count).toBe(0);

    // After clear, the same triple can be marked again.
    await expect(store.checkAndMark("task", "key", "2026-05-18")).resolves.toBe(true);
  });
});
