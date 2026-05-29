import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type RuntimeDb = Database.Database;

export function openRuntimeDb(filePath: string): RuntimeDb {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  // Foreign keys must be enabled per-connection for `on delete cascade` to fire;
  // without this, ChatBindingStore.clear() would leave orphan rows in
  // chat_binding_repositories. Set BEFORE migrate so schema-time constraints apply.
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: RuntimeDb): void {
  // The old `chat_bindings` table belonged to the now-removed workspace feature
  // (different shape: workspace_path/default_provider). It has zero consumers and is
  // empty on every install — drop it unconditionally before creating the new shape.
  db.exec(`drop table if exists chat_bindings;`);

  db.exec(`
    create table if not exists chat_bindings (
      scope_key text primary key,
      updated_at text not null
    );
    create table if not exists chat_binding_repositories (
      scope_key text not null,
      repository_id text not null,
      ordinal integer not null,
      primary key (scope_key, repository_id),
      foreign key (scope_key) references chat_bindings(scope_key) on delete cascade
    );
    create index if not exists chat_binding_repositories_scope_idx
      on chat_binding_repositories(scope_key, ordinal);

    create table if not exists sessions (
      session_key text primary key,
      name text,
      agent_kind text,
      acp_session_id text,
      quiet integer not null default 0,
      created_at text not null,
      last_active_at text not null,
      status text not null check (status in ('active', 'closed'))
    );
    create index if not exists sessions_status_idx on sessions(status, last_active_at);

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

  db.exec(`
    create table if not exists tasks (
      id text primary key,
      name text not null,
      kind text not null,
      cron text not null,
      timezone text not null,
      enabled integer not null default 1,
      source text not null,
      error_policy text not null,
      consecutive_failures integer not null default 0,
      last_error_notified_at text,
      params_json text not null,
      active_hours_json text,
      target_json text,
      last_run_json text,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists tasks_kind_idx on tasks(kind);
    create index if not exists tasks_enabled_idx on tasks(enabled);

    create table if not exists dedup_keys (
      task_id text not null,
      condition_key text not null,
      date_in_tz text not null,
      primary key (task_id, condition_key, date_in_tz)
    );
    create index if not exists dedup_keys_date_idx on dedup_keys(date_in_tz);
  `);
}

function ensureColumn(db: RuntimeDb, table: string, column: string, type: string): void {
  const rows = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${type}`);
  }
}
