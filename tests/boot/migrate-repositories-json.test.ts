import Database from "better-sqlite3";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, type RuntimeDb } from "../../src/app/runtime-db.js";
import { migrateLegacyRepositoriesJson } from "../../src/boot/phases/stores-phase.js";
import { RepositoryStore } from "../../src/resources/repositories/repository-store.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/** A minimal valid repositories.json with two repos (repo_1, repo_2) and nextId 3. */
function legacyFileContent(): string {
  return JSON.stringify({
    schemaVersion: 1,
    nextId: 3,
    repositories: [
      {
        id: "repo_1",
        name: "alpha",
        remoteUrl: "https://x/alpha",
        defaultBaseBranch: "main",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z"
      },
      {
        id: "repo_2",
        name: "beta",
        remoteUrl: "https://x/beta",
        defaultBaseBranch: "develop",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z"
      }
    ]
  });
}

describe("migrateLegacyRepositoriesJson", () => {
  let home: string;
  let db: RuntimeDb;
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-repo-migrate-"));
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

  it("no-ops when repositories.json doesn't exist so first-run boot stays clean", async () => {
    await migrateLegacyRepositoriesJson(home, db);
    const count = (db.prepare(`select count(*) as n from repositories`).get() as { n: number }).n;
    expect(count).toBe(0);
  });

  it("migrates repositories.json into SQLite, restores nextId, and unlinks the legacy file", async () => {
    const filePath = join(home, "repositories.json");
    await writeFile(filePath, legacyFileContent(), "utf8");

    await migrateLegacyRepositoriesJson(home, db);

    // (a) Both repos round-trip through the store in insertion order with all fields.
    const store = new RepositoryStore(db);
    const list = store.list();
    expect(list.map((r) => r.id)).toEqual(["repo_1", "repo_2"]);
    expect(list.map((r) => r.name)).toEqual(["alpha", "beta"]);
    expect(store.findByUrl("https://x/beta")?.defaultBaseBranch).toBe("develop");

    // (b) The counter was restored to nextId=3: the next add must be repo_3, NOT
    //     repo_1 (which would collide) and NOT repo_3-by-accident-of-reset. This is
    //     the proof that the counter was carried over rather than reset to 1.
    const added = await store.add({ name: "gamma", remoteUrl: "https://x/gamma", defaultBaseBranch: "main" });
    expect(added.id).toBe("repo_3");

    // (c) Legacy file is unlinked so the next boot is a clean no-op.
    expect(existsSync(filePath)).toBe(false);
  });

  it("partial-rollback: file present AND DB already populated → file renamed to .bak, DB untouched", async () => {
    // Seed the DB so the migration sees an existing row.
    const seed = new RepositoryStore(db);
    await seed.add({ name: "existing", remoteUrl: "https://x/existing", defaultBaseBranch: "main" });

    const filePath = join(home, "repositories.json");
    await writeFile(filePath, legacyFileContent(), "utf8");

    await migrateLegacyRepositoriesJson(home, db);

    // Legacy file moved aside — operator can inspect; no silent overwrite/merge.
    expect(existsSync(filePath)).toBe(false);
    const baks = readdirSync(home).filter((f) => f.startsWith("repositories.json.bak."));
    expect(baks).toHaveLength(1);

    // DB unchanged: still only the seeded repo; the legacy repos were NOT inserted.
    const count = (db.prepare(`select count(*) as n from repositories`).get() as { n: number }).n;
    expect(count).toBe(1);
    expect(new RepositoryStore(db).list().map((r) => r.name)).toEqual(["existing"]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
  });

  it("aborts boot loudly on corrupt repositories.json — preserves data via .bak, surfaces error", async () => {
    const filePath = join(home, "repositories.json");
    await writeFile(filePath, "{ not json", "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // (1) Boot aborts — no silent degradation into "no repositories registered".
      await expect(migrateLegacyRepositoriesJson(home, db)).rejects.toThrow(/corrupt repositories\.json/i);

      // (2) Original file gone; data preserved as .bak so the next boot is a clean no-op.
      expect(existsSync(filePath)).toBe(false);
      const baks = readdirSync(home).filter((f) => f.startsWith("repositories.json.bak."));
      expect(baks).toHaveLength(1);

      // (3) Operator-visible error names the .bak path so they know where their data went.
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
