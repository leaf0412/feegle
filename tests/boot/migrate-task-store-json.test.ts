import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { migrateLegacyTaskStoreJson } from "../../src/infra/boot/phases/stores-phase.js";
import { TaskStore } from "../../src/features/scheduler/task-store.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** A minimal valid task-store.json payload for two tasks. */
function legacyFileContent(): string {
  return JSON.stringify({
    schemaVersion: 1,
    tasks: [
      {
        id: "task-alpha",
        name: "Alpha Task",
        kind: "heartbeat",
        params: { symbol: "AAPL" },
        cron: "0 9 * * *",
        timezone: "Asia/Shanghai",
        activeHours: ["09:00", "17:00"],
        target: { platform: "feishu", chatId: "oc_abc" },
        enabled: true,
        source: "seed",
        errorPolicy: "on-change",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
        lastRun: {
          at: "2026-05-02T00:00:00.000Z",
          status: "ok",
          durationMs: 123
        },
        consecutiveFailures: 0,
        lastErrorNotifiedAt: null
      },
      {
        id: "task-beta",
        name: "Beta Task",
        kind: "stock-quote",
        params: {},
        cron: "*/5 * * * *",
        timezone: "UTC",
        activeHours: null,
        target: null,
        enabled: false,
        source: "user",
        errorPolicy: "always",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
        lastRun: null,
        consecutiveFailures: 2,
        lastErrorNotifiedAt: "2026-05-04T06:00:00.000Z"
      }
    ]
  });
}

describe("migrateLegacyTaskStoreJson", () => {
  let home: string;
  let db: RuntimeDb;
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-task-store-migrate-"));
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

  it("no-ops when task-store.json doesn't exist so first-run boot stays clean", async () => {
    await migrateLegacyTaskStoreJson(home, db);
    const store = new TaskStore(db);
    expect(store.list()).toEqual([]);
  });

  it("migrates task-store.json into SQLite and unlinks the legacy file", async () => {
    const filePath = join(home, "task-store.json");
    await writeFile(filePath, legacyFileContent(), "utf8");

    await migrateLegacyTaskStoreJson(home, db);

    // (a) Both tasks round-trip through the store with every field intact.
    //     Failing here means the migrator wrote rows the store cannot read — a
    //     same-process regression that would otherwise only show up at next boot.
    const store = new TaskStore(db);
    const alpha = store.get("task-alpha");
    expect(alpha).toBeDefined();
    expect(alpha!.id).toBe("task-alpha");
    expect(alpha!.name).toBe("Alpha Task");
    expect(alpha!.kind).toBe("heartbeat");
    expect(alpha!.params).toEqual({ symbol: "AAPL" });
    expect(alpha!.cron).toBe("0 9 * * *");
    expect(alpha!.timezone).toBe("Asia/Shanghai");
    expect(alpha!.activeHours).toEqual(["09:00", "17:00"]);
    expect(alpha!.target).toEqual({ platform: "feishu", chatId: "oc_abc" });
    expect(alpha!.enabled).toBe(true);
    expect(alpha!.source).toBe("seed");
    expect(alpha!.errorPolicy).toBe("on-change");
    expect(alpha!.createdAt).toBe("2026-05-01T00:00:00.000Z");
    expect(alpha!.updatedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(alpha!.lastRun).toEqual({
      at: "2026-05-02T00:00:00.000Z",
      status: "ok",
      durationMs: 123
    });
    expect(alpha!.consecutiveFailures).toBe(0);
    expect(alpha!.lastErrorNotifiedAt).toBeNull();

    const beta = store.get("task-beta");
    expect(beta).toBeDefined();
    expect(beta!.enabled).toBe(false);
    expect(beta!.source).toBe("user");
    expect(beta!.errorPolicy).toBe("always");
    expect(beta!.activeHours).toBeNull();
    expect(beta!.target).toBeNull();
    expect(beta!.lastRun).toBeNull();
    expect(beta!.consecutiveFailures).toBe(2);
    expect(beta!.lastErrorNotifiedAt).toBe("2026-05-04T06:00:00.000Z");

    expect(store.list()).toHaveLength(2);

    // (b) Legacy file is unlinked so the next boot is a clean no-op.
    expect(existsSync(filePath)).toBe(false);
  });

  it("partial-rollback: file present AND DB already populated → file renamed to .bak, DB untouched", async () => {
    // Seed the DB so the migration sees existing rows.
    const seed = new TaskStore(db);
    await seed.upsert({
      id: "existing",
      name: "Existing Task",
      kind: "heartbeat",
      params: {},
      cron: "0 * * * *",
      timezone: "UTC",
      activeHours: null,
      target: null,
      enabled: true,
      source: "seed",
      errorPolicy: "on-change",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastRun: null,
      consecutiveFailures: 0,
      lastErrorNotifiedAt: null
    });

    const filePath = join(home, "task-store.json");
    await writeFile(filePath, legacyFileContent(), "utf8");

    await migrateLegacyTaskStoreJson(home, db);

    // Legacy file moved aside — operator can inspect; no silent overwrite/merge.
    expect(existsSync(filePath)).toBe(false);
    const baks = readdirSync(home).filter((f) => f.startsWith("task-store.json.bak."));
    expect(baks).toHaveLength(1);

    // DB unchanged: still only the seeded task; the legacy tasks were NOT inserted.
    const after = new TaskStore(db);
    expect(after.get("existing")?.name).toBe("Existing Task");
    expect(after.get("task-alpha")).toBeUndefined();
    expect(after.get("task-beta")).toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
  });

  it("aborts boot loudly on corrupt task-store.json — preserves data via .bak, surfaces error", async () => {
    const filePath = join(home, "task-store.json");
    await writeFile(filePath, "{ not json", "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // (1) Boot aborts — no silent degradation into "no tasks configured".
      await expect(migrateLegacyTaskStoreJson(home, db)).rejects.toThrow(
        /corrupt task-store\.json/i
      );

      // (2) Original file gone; data preserved as .bak so the next boot is a clean no-op.
      expect(existsSync(filePath)).toBe(false);
      const baks = readdirSync(home).filter((f) => f.startsWith("task-store.json.bak."));
      expect(baks).toHaveLength(1);

      // (3) Operator-visible error names the .bak path so they know where their data went.
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
