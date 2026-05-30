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
}
