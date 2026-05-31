import type { RuntimeDb } from "../../infra/app/runtime-db.js";
import type { ArtifactRecord } from "./artifact-models.js";

export class ArtifactStore {
  constructor(private readonly db: RuntimeDb) {}

  insert(record: ArtifactRecord): void {
    this.db
      .prepare(
        `insert into artifacts
          (
            id, workspace_id, workflow_instance_id, run_attempt_id, kind,
            file_path, content_type, summary_json, retention_days, pinned,
            created_at, updated_at
          )
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.workspaceId,
        record.workflowInstanceId,
        record.runAttemptId,
        record.kind,
        record.filePath,
        record.contentType,
        JSON.stringify(record.summary),
        record.retentionDays,
        record.pinned ? 1 : 0,
        record.createdAt,
        record.updatedAt
      );
  }

  listByRun(workspaceId: string, runAttemptId: string): Array<{ id: string; kind: string; filePath: string }> {
    const rows = this.db
      .prepare(
        `select id, kind, file_path
         from artifacts
         where workspace_id = ? and run_attempt_id = ?
         order by created_at asc`
      )
      .all(workspaceId, runAttemptId) as Array<{ id: string; kind: string; file_path: string }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      filePath: row.file_path
    }));
  }

  listByWorkflow(workspaceId: string, workflowInstanceId: string): Array<{ id: string; kind: string; filePath: string }> {
    const rows = this.db
      .prepare(
        `select id, kind, file_path
         from artifacts
         where workspace_id = ? and workflow_instance_id = ?
         order by created_at asc`
      )
      .all(workspaceId, workflowInstanceId) as Array<{ id: string; kind: string; file_path: string }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      filePath: row.file_path
    }));
  }

  pin(id: string, now: string): void {
    this.db
      .prepare(`update artifacts set pinned = 1, updated_at = ? where id = ?`)
      .run(now, id);
  }

  unpin(id: string, now: string): void {
    this.db
      .prepare(`update artifacts set pinned = 0, updated_at = ? where id = ?`)
      .run(now, id);
  }

  markDeleted(id: string, now: string): void {
    this.db
      .prepare(
        `update artifacts set content_type = 'deleted', summary_json = ?, updated_at = ? where id = ?`
      )
      .run(JSON.stringify({ deleted: true, deletedAt: now }), now, id);
  }

  listExpiredUnpinned(now: string): Array<{ id: string; filePath: string; retentionDays: number; pinned: boolean }> {
    const rows = this.db
      .prepare(
        `select id, file_path, retention_days, pinned
         from artifacts
         where pinned = 0 and content_type != 'deleted'
         order by created_at asc`
      )
      .all() as Array<{ id: string; file_path: string; retention_days: number; pinned: 0 | 1 }>;

    return rows
      .filter((row) => row.retention_days > 0)
      .map((row) => ({
        id: row.id,
        filePath: row.file_path,
        retentionDays: row.retention_days,
        pinned: row.pinned === 1
      }));
  }
}
