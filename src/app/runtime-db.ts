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
      doc_token text,
      doc_url text,
      created_at text not null,
      updated_at text not null,
      primary key (plan_id, version)
    );

    create table if not exists gitlab_follow_entries (
      id integer primary key autoincrement,
      host text not null,
      project_id integer not null,
      issue_iid integer not null,
      issue_url text not null,
      project_path text not null,
      title text not null,
      status text not null default 'discovered',
      agent_prompt text,
      agent_response text,
      user_feedback text,
      branch_name text,
      worktree_path text,
      error_message text,
      created_at text not null,
      updated_at text not null,
      unique(host, project_id, issue_iid)
    );
  `);
  ensureColumn(db, "plan_artifacts", "doc_token", "text");
  ensureColumn(db, "plan_artifacts", "doc_url", "text");
  ensureColumn(db, "plan_artifacts", "base_branch", "text");
  ensureColumn(db, "plan_artifacts", "base_sha", "text");
  ensureColumn(db, "plan_artifacts", "head_branch", "text");
  ensureColumn(db, "plan_artifacts", "head_sha", "text");
  ensureColumn(db, "plan_artifacts", "worktree_path", "text");
  ensureColumn(db, "plan_artifacts", "commit_count", "integer");
  ensureColumn(db, "plan_artifacts", "files_changed", "integer");
  ensureColumn(db, "plan_artifacts", "execution_iteration", "integer not null default 1");
  ensureColumn(db, "plan_artifacts", "iteration_notes", "text");
  ensureColumn(db, "plan_artifacts", "progress_card_message_id", "text");
  ensureColumn(db, "plan_artifacts", "error_message", "text");
}

function ensureColumn(db: RuntimeDb, table: string, column: string, type: string): void {
  const rows = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${type}`);
  }
}
