import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { migrateLegacyChatBindingsJson } from "../../src/infra/boot/phases/stores-phase.js";
import { ChatBindingStore } from "../../src/resources/repositories/chat-binding-store.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

describe("migrateLegacyChatBindingsJson", () => {
  let home: string;
  let db: RuntimeDb;
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-cbs-migrate-"));
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

  it("no-ops when chat-bindings.json doesn't exist so first-run boot stays clean", async () => {
    await migrateLegacyChatBindingsJson(home, db);
    const store = new ChatBindingStore(db);
    expect(store.get("oc_anything")).toBeUndefined();
  });

  it("migrates chat-bindings.json into SQLite and unlinks the legacy file", async () => {
    const filePath = join(home, "chat-bindings.json");
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        bindings: [
          { chatId: "oc_group", repositoryIds: ["repo_a", "repo_b"], updatedAt: "2026-05-01T00:00:00.000Z" },
          { chatId: "user:ou_a", repositoryIds: ["repo_c"], updatedAt: "2026-05-02T00:00:00.000Z" }
        ]
      }),
      "utf8"
    );

    await migrateLegacyChatBindingsJson(home, db);

    // (a) Both bindings round-trip through the store with order, ids, and timestamps intact.
    //     Failing here means the migrator wrote rows that the store cannot read — a
    //     same-process regression that would otherwise only show up at next boot.
    const store = new ChatBindingStore(db);
    expect(store.get("oc_group")?.repositoryIds).toEqual(["repo_a", "repo_b"]);
    expect(store.get("oc_group")?.updatedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(store.get("user:ou_a")?.repositoryIds).toEqual(["repo_c"]);
    expect(store.get("user:ou_a")?.updatedAt).toBe("2026-05-02T00:00:00.000Z");

    // (b) Legacy file is unlinked so the next boot is a clean no-op.
    expect(existsSync(filePath)).toBe(false);
  });

  it("partial-rollback: file present AND DB already populated → file renamed to .bak, DB untouched", async () => {
    // Seed the DB so the migration sees existing rows.
    const seed = new ChatBindingStore(db);
    await seed.addRepository("oc_existing", "repo_x");

    const filePath = join(home, "chat-bindings.json");
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        bindings: [{ chatId: "oc_stale", repositoryIds: ["repo_stale"], updatedAt: "t" }]
      }),
      "utf8"
    );

    await migrateLegacyChatBindingsJson(home, db);

    // Legacy file moved aside — operator can inspect; no silent overwrite/merge.
    expect(existsSync(filePath)).toBe(false);
    const baks = readdirSync(home).filter((f) => f.startsWith("chat-bindings.json.bak."));
    expect(baks).toHaveLength(1);

    // DB unchanged: still only the seeded binding; the stale legacy entry was NOT inserted.
    const after = new ChatBindingStore(db);
    expect(after.get("oc_existing")?.repositoryIds).toEqual(["repo_x"]);
    expect(after.get("oc_stale")).toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
  });

  it("aborts boot loudly on corrupt chat-bindings.json — preserves data via .bak, surfaces error", async () => {
    const filePath = join(home, "chat-bindings.json");
    await writeFile(filePath, "{ not json", "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // (1) Boot aborts — no silent degradation into "no bindings configured".
      await expect(migrateLegacyChatBindingsJson(home, db)).rejects.toThrow(/corrupt chat-bindings\.json/i);

      // (2) Original file gone; data preserved as .bak so the next boot is a clean no-op.
      expect(existsSync(filePath)).toBe(false);
      const baks = readdirSync(home).filter((f) => f.startsWith("chat-bindings.json.bak."));
      expect(baks).toHaveLength(1);

      // (3) Operator-visible error names the .bak path so they know where their data went.
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
