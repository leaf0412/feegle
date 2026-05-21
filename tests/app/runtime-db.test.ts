import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";

describe("openRuntimeDb", () => {
  let home: string;
  let db: RuntimeDb | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-runtime-db-"));
  });

  afterEach(async () => {
    db?.close();
    await rm(home, { recursive: true, force: true });
  });

  it("creates runtime tables on open", () => {
    db = openRuntimeDb(join(home, "feegle.db"));

    expect(tableExists(db, "chat_bindings")).toBe(true);
    expect(tableExists(db, "pending_interactions")).toBe(true);
    expect(tableExists(db, "plan_artifacts")).toBe(true);
  });

  it("adds doc_token and doc_url columns to plan_artifacts when migrating an older db", () => {
    const dbPath = join(home, "legacy.db");
    const legacy = new Database(dbPath);
    legacy.exec(`
      create table plan_artifacts (
        plan_id text not null,
        chat_id text not null,
        source_message_id text not null,
        provider text not null,
        workspace_path text not null,
        version integer not null,
        file_path text not null,
        feishu_file_message_id text,
        status text not null,
        revision_note text,
        created_at text not null,
        updated_at text not null,
        primary key (plan_id, version)
      );
    `);
    legacy.close();

    db = openRuntimeDb(dbPath);
    const columns = (db.prepare("pragma table_info(plan_artifacts)").all() as Array<{ name: string }>).map(
      (row) => row.name
    );

    expect(columns).toContain("doc_token");
    expect(columns).toContain("doc_url");
  });

  it("openRuntimeDb is idempotent when the new columns already exist", () => {
    const dbPath = join(home, "fresh.db");
    db = openRuntimeDb(dbPath);
    db.close();
    db = undefined;

    expect(() => openRuntimeDb(dbPath).close()).not.toThrow();
  });
});

function tableExists(db: RuntimeDb, tableName: string): boolean {
  return Boolean(
    db
      .prepare("select name from sqlite_master where type = 'table' and name = ?")
      .get(tableName)
  );
}
