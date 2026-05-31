import type { Statement } from "better-sqlite3";
import type { RuntimeDb } from "../../infra/app/runtime-db.js";
import type { Task } from "./task.js";

/**
 * Persists tasks in the SQLite `tasks` table.
 *
 * Marshalling rules:
 *  - `enabled: boolean`        ↔ integer 0/1
 *  - `params`, `activeHours`, `target`, `lastRun` ↔ JSON text columns
 *  - All date fields stay as ISO strings (text)
 *
 * Corrupt JSON in a DB row (e.g. from external tampering) throws with the
 * task id rather than silently returning a default — corruption must be visible.
 */

export interface TaskStoreOptions {
  clock?: () => Date;
}

interface TaskRow {
  id: string;
  name: string;
  kind: string;
  cron: string;
  timezone: string;
  enabled: number;
  source: string;
  error_policy: string;
  consecutive_failures: number;
  last_error_notified_at: string | null;
  params_json: string;
  active_hours_json: string | null;
  target_json: string | null;
  last_run_json: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(row.params_json) as Record<string, unknown>;
  } catch {
    throw new Error(`task-store: corrupt params_json for task id=${row.id}`);
  }

  let activeHours: string[] | null = null;
  if (row.active_hours_json !== null) {
    try {
      activeHours = JSON.parse(row.active_hours_json) as string[];
    } catch {
      throw new Error(`task-store: corrupt active_hours_json for task id=${row.id}`);
    }
  }

  let target: Task["target"] = null;
  if (row.target_json !== null) {
    try {
      target = JSON.parse(row.target_json) as Task["target"];
    } catch {
      throw new Error(`task-store: corrupt target_json for task id=${row.id}`);
    }
  }

  let lastRun: Task["lastRun"] = null;
  if (row.last_run_json !== null) {
    try {
      lastRun = JSON.parse(row.last_run_json) as Task["lastRun"];
    } catch {
      throw new Error(`task-store: corrupt last_run_json for task id=${row.id}`);
    }
  }

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    cron: row.cron,
    timezone: row.timezone,
    enabled: row.enabled === 1,
    source: row.source as Task["source"],
    errorPolicy: row.error_policy as Task["errorPolicy"],
    consecutiveFailures: row.consecutive_failures,
    lastErrorNotifiedAt: row.last_error_notified_at,
    params,
    activeHours,
    target,
    lastRun,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function taskToBindings(task: Task): Record<string, unknown> {
  return {
    id: task.id,
    name: task.name,
    kind: task.kind,
    cron: task.cron,
    timezone: task.timezone,
    enabled: task.enabled ? 1 : 0,
    source: task.source,
    error_policy: task.errorPolicy,
    consecutive_failures: task.consecutiveFailures,
    last_error_notified_at: task.lastErrorNotifiedAt,
    params_json: JSON.stringify(task.params),
    active_hours_json: task.activeHours !== null ? JSON.stringify(task.activeHours) : null,
    target_json: task.target !== null ? JSON.stringify(task.target) : null,
    last_run_json: task.lastRun !== null ? JSON.stringify(task.lastRun) : null,
    created_at: task.createdAt,
    updated_at: task.updatedAt
  };
}

export class TaskStore {
  private readonly clock: () => Date;
  private readonly listStmt: Statement;
  private readonly getStmt: Statement;
  private readonly upsertStmt: Statement;
  private readonly removeStmt: Statement;
  private readonly existsStmt: Statement;

  constructor(
    db: RuntimeDb,
    options: TaskStoreOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date());

    this.listStmt = db.prepare(
      `select id, name, kind, cron, timezone, enabled, source, error_policy,
              consecutive_failures, last_error_notified_at,
              params_json, active_hours_json, target_json, last_run_json,
              created_at, updated_at
         from tasks order by created_at`
    );

    this.getStmt = db.prepare(
      `select id, name, kind, cron, timezone, enabled, source, error_policy,
              consecutive_failures, last_error_notified_at,
              params_json, active_hours_json, target_json, last_run_json,
              created_at, updated_at
         from tasks where id = ?`
    );

    this.upsertStmt = db.prepare(
      `insert into tasks(id, name, kind, cron, timezone, enabled, source, error_policy,
                         consecutive_failures, last_error_notified_at,
                         params_json, active_hours_json, target_json, last_run_json,
                         created_at, updated_at)
         values (@id, @name, @kind, @cron, @timezone, @enabled, @source, @error_policy,
                 @consecutive_failures, @last_error_notified_at,
                 @params_json, @active_hours_json, @target_json, @last_run_json,
                 @created_at, @updated_at)
         on conflict(id) do update set
           name = excluded.name,
           kind = excluded.kind,
           cron = excluded.cron,
           timezone = excluded.timezone,
           enabled = excluded.enabled,
           source = excluded.source,
           error_policy = excluded.error_policy,
           consecutive_failures = excluded.consecutive_failures,
           last_error_notified_at = excluded.last_error_notified_at,
           params_json = excluded.params_json,
           active_hours_json = excluded.active_hours_json,
           target_json = excluded.target_json,
           last_run_json = excluded.last_run_json,
           updated_at = excluded.updated_at`
    );

    this.removeStmt = db.prepare(`delete from tasks where id = ?`);

    this.existsStmt = db.prepare(`select 1 as found from tasks where id = ? limit 1`);
  }

  list(): readonly Task[] {
    const rows = this.listStmt.all() as TaskRow[];
    return rows.map(rowToTask);
  }

  get(id: string): Task | undefined {
    const row = this.getStmt.get(id) as TaskRow | undefined;
    return row ? rowToTask(row) : undefined;
  }

  async upsert(task: Task): Promise<void> {
    const now = this.clock().toISOString();
    const bindings = taskToBindings({ ...task, updatedAt: now });
    this.upsertStmt.run(bindings);
  }

  async remove(id: string): Promise<void> {
    this.removeStmt.run(id);
  }

  async ensureSeed(seeds: Task[]): Promise<void> {
    for (const seed of seeds) {
      const exists = (this.existsStmt.get(seed.id) as { found: number } | undefined) !== undefined;
      if (!exists) {
        this.upsertStmt.run(taskToBindings(seed));
      }
    }
  }
}
