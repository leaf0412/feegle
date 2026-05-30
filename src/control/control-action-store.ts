import type { RuntimeDb } from "../app/runtime-db.js";

export interface ControlActionRecord {
  id: string;
  workspaceId: string;
  actorUserId: string | null;
  actionType: string;
  status: "pending" | "completed" | "failed";
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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
      createdAt: input.now,
      updatedAt: input.now
    };

    this.db
      .prepare(
        `insert into control_actions
          (id, workspace_id, actor_user_id, action_type, status, payload_json, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.workspaceId,
        record.actorUserId,
        record.actionType,
        record.status,
        JSON.stringify(record.payload),
        record.createdAt,
        record.updatedAt
      );

    return record;
  }
}
