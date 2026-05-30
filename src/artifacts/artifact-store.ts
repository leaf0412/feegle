import type { RuntimeDb } from "../app/runtime-db.js";
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
}
