import type { RuntimeDb } from "../app/runtime-db.js";

export interface ControlActionRecord {
  id: string;
  workspaceId: string;
  actorUserId: string | null;
  actionType: string;
  status: "pending" | "completed" | "failed";
  payload: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbControlActionRow {
  id: string;
  workspace_id: string;
  actor_user_id: string | null;
  action_type: string;
  status: "pending" | "completed" | "failed";
  payload_json: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbControlActionRow): ControlActionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id,
    actionType: row.action_type,
    status: row.status,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ControlActionStore {
  constructor(private readonly db: RuntimeDb) {}

  create(input: {
    id: string;
    workspaceId: string;
    actorUserId: string | null;
    actionType: string;
    payload: Record<string, unknown>;
    now: string;
  }): ControlActionRecord {
    const record: ControlActionRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actionType: input.actionType,
      status: "pending",
      payload: input.payload,
      errorMessage: null,
      createdAt: input.now,
      updatedAt: input.now
    };

    this.db
      .prepare(
        `insert into control_actions
          (id, workspace_id, actor_user_id, action_type, status, payload_json, error_message, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.workspaceId,
        record.actorUserId,
        record.actionType,
        record.status,
        JSON.stringify(record.payload),
        record.errorMessage,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getById(id: string): ControlActionRecord | undefined {
    const row = this.db
      .prepare(
        `select id, workspace_id, actor_user_id, action_type, status, payload_json, error_message, created_at, updated_at
         from control_actions where id = ?`
      )
      .get(id) as DbControlActionRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  updateStatus(input: {
    id: string;
    status: "completed" | "failed";
    errorMessage: string | null;
    now: string;
  }): void {
    this.db
      .prepare(
        `update control_actions set status = ?, error_message = ?, updated_at = ? where id = ?`
      )
      .run(input.status, input.errorMessage, input.now, input.id);
  }

  listPending(workspaceId: string): ControlActionRecord[] {
    const rows = this.db
      .prepare(
        `select id, workspace_id, actor_user_id, action_type, status, payload_json, error_message, created_at, updated_at
         from control_actions
         where workspace_id = ? and status = 'pending'
         order by created_at asc`
      )
      .all(workspaceId) as DbControlActionRow[];

    return rows.map(mapRow);
  }
}
