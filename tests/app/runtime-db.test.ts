import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";

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
    expect(tableExists(db, "chat_binding_repositories")).toBe(true);
    expect(tableExists(db, "pending_interactions")).toBe(true);
    expect(tableExists(db, "plan_artifacts")).toBe(true);
  });

  it("creates workspace resource boundary tables so runtime records have an owner", () => {
    db = openRuntimeDb(join(home, "feegle.db"));

    expect(tableExists(db, "workspaces")).toBe(true);
    expect(tableExists(db, "users")).toBe(true);
    expect(tableExists(db, "external_identities")).toBe(true);
    expect(tableExists(db, "memberships")).toBe(true);
    expect(tableExists(db, "projects")).toBe(true);
    expect(tableExists(db, "conversation_bindings_v2")).toBe(true);
  });

  it("enables foreign_keys pragma so chat_bindings ON DELETE CASCADE actually fires", () => {
    // Without this pragma the cascade is silently a no-op — ChatBindingStore.clear()
    // would leave orphan rows. Verifying it at the connection level catches a regression
    // where someone removes the pragma in openRuntimeDb.
    db = openRuntimeDb(join(home, "feegle.db"));
    const row = db.prepare("pragma foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });

  it("drops the legacy workspace-shape chat_bindings table when migrating an older db", () => {
    // Old `chat_bindings` had columns (workspace_path, default_provider, ...) from the removed
    // workspace feature. New shape is (scope_key, updated_at). Migration must replace the table
    // — leaving the old columns would break ChatBindingStore queries on every legacy install.
    const dbPath = join(home, "legacy-workspace.db");
    const legacy = new Database(dbPath);
    legacy.exec(`
      create table chat_bindings (
        chat_id text primary key,
        workspace_path text not null,
        default_provider text,
        updated_by text,
        updated_at text not null
      );
    `);
    legacy.close();

    db = openRuntimeDb(dbPath);
    const columns = (db.prepare("pragma table_info(chat_bindings)").all() as Array<{ name: string }>).map(
      (row) => row.name
    );
    expect(columns).toEqual(["scope_key", "updated_at"]);
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
