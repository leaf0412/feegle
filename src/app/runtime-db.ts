import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type RuntimeDb = Database.Database;

export function openRuntimeDb(filePath: string): RuntimeDb {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: RuntimeDb): void {
  db.exec(`
    create table if not exists chat_bindings (
      chat_id text primary key,
      workspace_path text not null,
      default_provider text,
      updated_by text,
      updated_at text not null
    );

    create table if not exists pending_interactions (
      interaction_id text primary key,
      chat_id text not null,
      message_id text not null,
      kind text not null,
      payload_json text not null,
      created_at text not null,
      expires_at text not null
    );

    create table if not exists plan_artifacts (
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
}
