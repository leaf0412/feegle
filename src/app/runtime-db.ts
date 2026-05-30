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

    create table if not exists repositories (
      id text primary key,
      name text not null,
      remote_url text not null,
      default_base_branch text not null,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists repositories_remote_url_idx on repositories(remote_url);
    create index if not exists repositories_name_idx on repositories(name);

    create table if not exists repository_id_counter (
      id integer primary key check (id = 1),
      next_id integer not null
    );
  `);

  db.exec(`
    create table if not exists workspaces (
      id text primary key,
      name text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists users (
      id text primary key,
      display_name text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists external_identities (
      id text primary key,
      user_id text not null,
      provider text not null,
      external_user_id text not null,
      created_at text not null,
      updated_at text not null,
      unique(provider, external_user_id),
      foreign key (user_id) references users(id) on delete cascade
    );

    create table if not exists memberships (
      workspace_id text not null,
      user_id text not null,
      role text not null check (role in ('owner', 'admin', 'maintainer', 'member', 'viewer')),
      created_at text not null,
      updated_at text not null,
      primary key (workspace_id, user_id),
      foreign key (workspace_id) references workspaces(id) on delete cascade,
      foreign key (user_id) references users(id) on delete cascade
    );

    create table if not exists projects (
      id text primary key,
      workspace_id text not null,
      name text not null,
      created_at text not null,
      updated_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );
    create index if not exists projects_workspace_idx on projects(workspace_id);

    create table if not exists conversation_bindings_v2 (
      conversation_key text primary key,
      workspace_id text not null,
      project_id text,
      created_at text not null,
      updated_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade,
      foreign key (project_id) references projects(id) on delete set null
    );
    create index if not exists conversation_bindings_v2_workspace_idx
      on conversation_bindings_v2(workspace_id);
  `);

  db.exec(`
    create table if not exists workflow_definitions (
      id text primary key,
      version integer not null,
      concurrency_policy text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists workflow_instances (
      id text primary key,
      workspace_id text not null,
      project_id text,
      definition_id text not null,
      definition_version integer not null,
      status text not null,
      current_step_id text,
      created_at text not null,
      updated_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade,
      foreign key (project_id) references projects(id) on delete set null
    );
    create index if not exists workflow_instances_workspace_idx on workflow_instances(workspace_id);

    create table if not exists run_attempts (
      id text primary key,
      workflow_instance_id text not null,
      status text not null,
      trigger_event_id text,
      lease_owner text,
      lease_expires_at text,
      attempt_count integer not null default 0,
      next_run_at text,
      locked_at text,
      started_at text,
      finished_at text,
      error_json text,
      created_at text not null,
      updated_at text not null,
      foreign key (workflow_instance_id) references workflow_instances(id) on delete cascade
    );
    create index if not exists run_attempts_instance_status_idx
      on run_attempts(workflow_instance_id, status);

    create table if not exists step_states (
      id text primary key,
      workflow_instance_id text not null,
      run_attempt_id text,
      step_id text not null,
      status text not null,
      input_json text,
      output_json text,
      wait_condition_json text,
      error_json text,
      started_at text,
      finished_at text,
      created_at text not null,
      updated_at text not null,
      foreign key (workflow_instance_id) references workflow_instances(id) on delete cascade,
      foreign key (run_attempt_id) references run_attempts(id) on delete set null
    );

    create table if not exists effect_executions (
      id text primary key,
      run_attempt_id text not null,
      step_state_id text,
      plugin_id text not null,
      effect_type text not null,
      status text not null,
      idempotency_key text,
      input_summary_json text,
      output_summary_json text,
      error_json text,
      started_at text,
      finished_at text,
      created_at text not null,
      updated_at text not null,
      foreign key (run_attempt_id) references run_attempts(id) on delete cascade,
      foreign key (step_state_id) references step_states(id) on delete set null
    );
    create unique index if not exists effect_executions_idempotency_idx
      on effect_executions(idempotency_key)
      where idempotency_key is not null;

    create table if not exists runtime_events (
      id text primary key,
      workspace_id text not null,
      workflow_instance_id text,
      run_attempt_id text,
      step_state_id text,
      effect_execution_id text,
      category text not null,
      type text not null,
      payload_json text not null,
      created_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );
    create index if not exists runtime_events_instance_idx on runtime_events(workflow_instance_id, created_at);
  `);

  db.exec(`
    create table if not exists artifacts (
      id text primary key,
      workspace_id text not null,
      workflow_instance_id text,
      run_attempt_id text,
      kind text not null,
      file_path text not null,
      content_type text not null,
      summary_json text not null,
      retention_days integer not null,
      pinned integer not null default 0,
      created_at text not null,
      updated_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );
    create index if not exists artifacts_workspace_kind_idx on artifacts(workspace_id, kind);
  `);

  db.exec(`
    create table if not exists memory_records (
      id text primary key,
      workspace_id text not null,
      project_id text,
      scope text not null,
      kind text not null,
      status text not null,
      content text not null,
      source_json text not null,
      confidence real not null,
      visibility text not null,
      expires_at text,
      created_at text not null,
      updated_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade,
      foreign key (project_id) references projects(id) on delete set null
    );
    create index if not exists memory_records_scope_idx
      on memory_records(workspace_id, project_id, scope, kind, status);
  `);

  db.exec(`
    create table if not exists control_actions (
      id text primary key,
      workspace_id text not null,
      actor_user_id text,
      action_type text not null,
      status text not null,
      payload_json text not null,
      created_at text not null,
      updated_at text not null,
      foreign key (workspace_id) references workspaces(id) on delete cascade
    );
    create index if not exists control_actions_workspace_status_idx
      on control_actions(workspace_id, status, created_at);
  `);
}

function ensureColumn(db: RuntimeDb, table: string, column: string, type: string): void {
  const rows = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${type}`);
  }
}
