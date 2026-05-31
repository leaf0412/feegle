import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { migrateLegacyDedupJson } from "../../src/infra/boot/phases/stores-phase.js";
import { DedupStore } from "../../src/features/scheduler/dedup-store.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** A minimal valid dedup.json payload with two marks for task-alpha and one for task-beta. */
function legacyFileContent(): string {
  return JSON.stringify({
    schemaVersion: 1,
    date: "2026-05-18",
    marks: {
      "task-alpha": ["sh600519:stop", "sh000001:stop"],
      "task-beta": ["sh600519:resume"]
    }
  });
}

describe("migrateLegacyDedupJson", () => {
  let home: string;
  let db: RuntimeDb;
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-dedup-migrate-"));
    db = makeDb();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(async () => {
    warn.mockRestore();
    info.mockRestore();
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("no-ops when dedup.json doesn't exist so first-run boot stays clean", async () => {
    await migrateLegacyDedupJson(home, db);
    const count = (db.prepare(`select count(*) as n from dedup_keys`).get() as { n: number }).n;
    expect(count).toBe(0);
  });

  it("migrates dedup.json into SQLite and unlinks the legacy file", async () => {
    const filePath = join(home, "dedup.json");
    await writeFile(filePath, legacyFileContent(), "utf8");

    await migrateLegacyDedupJson(home, db);

    // (a) All three marks round-trip through the store so checkAndMark returns false
    //     for each — confirming the rows were written with the right columns.
    const store = new DedupStore(db);
    await expect(store.checkAndMark("task-alpha", "sh600519:stop", "2026-05-18")).resolves.toBe(false);
    await expect(store.checkAndMark("task-alpha", "sh000001:stop", "2026-05-18")).resolves.toBe(false);
    await expect(store.checkAndMark("task-beta", "sh600519:resume", "2026-05-18")).resolves.toBe(false);

    // (b) The three marks and no more are in the table.
    const count = (db.prepare(`select count(*) as n from dedup_keys`).get() as { n: number }).n;
    expect(count).toBe(3);

    // (c) Legacy file is unlinked so the next boot is a clean no-op.
    expect(existsSync(filePath)).toBe(false);
  });

  it("partial-rollback: file present AND DB already populated → file renamed to .bak, DB untouched", async () => {
    // Seed the DB so the migration sees existing rows.
    const seed = new DedupStore(db);
    await seed.checkAndMark("existing-task", "existing-key", "2026-05-17");

    const filePath = join(home, "dedup.json");
    await writeFile(filePath, legacyFileContent(), "utf8");

    await migrateLegacyDedupJson(home, db);

    // Legacy file moved aside — operator can inspect; no silent overwrite/merge.
    expect(existsSync(filePath)).toBe(false);
    const baks = readdirSync(home).filter((f) => f.startsWith("dedup.json.bak."));
    expect(baks).toHaveLength(1);

    // DB unchanged: still only the seeded row; the legacy marks were NOT inserted.
    const count = (db.prepare(`select count(*) as n from dedup_keys`).get() as { n: number }).n;
    expect(count).toBe(1);

    const row = db
      .prepare(`select task_id from dedup_keys where task_id = 'existing-task'`)
      .get() as { task_id: string } | undefined;
    expect(row?.task_id).toBe("existing-task");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
  });

  it("aborts boot loudly on corrupt dedup.json — preserves data via .bak, surfaces error", async () => {
    const filePath = join(home, "dedup.json");
    await writeFile(filePath, "{ not json", "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // (1) Boot aborts — no silent degradation into "no marks recorded".
      await expect(migrateLegacyDedupJson(home, db)).rejects.toThrow(/corrupt dedup\.json/i);

      // (2) Original file gone; data preserved as .bak so the next boot is a clean no-op.
      expect(existsSync(filePath)).toBe(false);
      const baks = readdirSync(home).filter((f) => f.startsWith("dedup.json.bak."));
      expect(baks).toHaveLength(1);

      // (3) Operator-visible error names the .bak path so they know where their data went.
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
