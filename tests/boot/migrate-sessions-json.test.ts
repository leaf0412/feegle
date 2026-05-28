import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStore } from "../../src/agent/session-store.js";
import { migrate, type RuntimeDb } from "../../src/app/runtime-db.js";
import { migrateLegacySessionsJson } from "../../src/boot/phases/stores-phase.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

describe("migrateLegacySessionsJson", () => {
  let home: string;
  let db: RuntimeDb;
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-sessions-migrate-"));
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

  it("no-ops when sessions.json doesn't exist so first-run boot stays clean", async () => {
    await migrateLegacySessionsJson(home, db);
    const store = new SessionStore(db);
    expect(store.list()).toEqual([]);
  });

  it("migrates sessions.json into SQLite and unlinks the legacy file", async () => {
    const filePath = join(home, "sessions.json");
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        sessions: [
          {
            sessionKey: "feishu:oc_a:root:m_1",
            name: "alpha",
            agentKind: "codex",
            createdAt: "2026-05-01T00:00:00.000Z",
            lastActiveAt: "2026-05-02T00:00:00.000Z",
            status: "active"
          },
          {
            sessionKey: "feishu:oc_b:root:m_2",
            agentKind: "claude_code",
            acpSessionId: "acp_42",
            quiet: true,
            createdAt: "2026-05-03T00:00:00.000Z",
            lastActiveAt: "2026-05-04T00:00:00.000Z",
            status: "closed"
          }
        ]
      }),
      "utf8"
    );

    await migrateLegacySessionsJson(home, db);

    // (a) Both sessions round-trip through the store with every field intact.
    //     Failing here means the migrator wrote rows the store cannot read — a
    //     same-process regression that would otherwise only show up at next boot.
    const store = new SessionStore(db);
    const alpha = store.get("feishu:oc_a:root:m_1");
    expect(alpha).toEqual({
      sessionKey: "feishu:oc_a:root:m_1",
      name: "alpha",
      agentKind: "codex",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastActiveAt: "2026-05-02T00:00:00.000Z",
      status: "active"
    });

    const beta = store.get("feishu:oc_b:root:m_2");
    expect(beta).toEqual({
      sessionKey: "feishu:oc_b:root:m_2",
      agentKind: "claude_code",
      acpSessionId: "acp_42",
      quiet: true,
      createdAt: "2026-05-03T00:00:00.000Z",
      lastActiveAt: "2026-05-04T00:00:00.000Z",
      status: "closed"
    });

    // (b) Legacy file is unlinked so the next boot is a clean no-op.
    expect(existsSync(filePath)).toBe(false);
  });

  it("partial-rollback: file present AND DB already populated → file renamed to .bak, DB untouched", async () => {
    // Seed the DB so the migration sees existing rows.
    const seed = new SessionStore(db);
    await seed.getOrCreate("feishu:existing", { name: "existing" });

    const filePath = join(home, "sessions.json");
    await writeFile(
      filePath,
      JSON.stringify({
        schemaVersion: 1,
        sessions: [
          {
            sessionKey: "feishu:stale",
            createdAt: "2026-01-01T00:00:00.000Z",
            lastActiveAt: "2026-01-01T00:00:00.000Z",
            status: "active"
          }
        ]
      }),
      "utf8"
    );

    await migrateLegacySessionsJson(home, db);

    // Legacy file moved aside — operator can inspect; no silent overwrite/merge.
    expect(existsSync(filePath)).toBe(false);
    const baks = readdirSync(home).filter((f) => f.startsWith("sessions.json.bak."));
    expect(baks).toHaveLength(1);

    // DB unchanged: still only the seeded session; the stale legacy entry was NOT inserted.
    const after = new SessionStore(db);
    expect(after.get("feishu:existing")?.name).toBe("existing");
    expect(after.get("feishu:stale")).toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
  });

  it("aborts boot loudly on corrupt sessions.json — preserves data via .bak, surfaces error", async () => {
    const filePath = join(home, "sessions.json");
    await writeFile(filePath, "{ not json", "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // (1) Boot aborts — no silent degradation into "no sessions configured".
      await expect(migrateLegacySessionsJson(home, db)).rejects.toThrow(/corrupt sessions\.json/i);

      // (2) Original file gone; data preserved as .bak so the next boot is a clean no-op.
      expect(existsSync(filePath)).toBe(false);
      const baks = readdirSync(home).filter((f) => f.startsWith("sessions.json.bak."));
      expect(baks).toHaveLength(1);

      // (3) Operator-visible error names the .bak path so they know where their data went.
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
