import type { RuntimeDb } from "@infra/app/runtime-db.js";
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

  getById(id: string): (ArtifactRecord & { isDeleted: boolean }) | undefined {
    const row = this.db
      .prepare(
        `select id, workspace_id, workflow_instance_id, run_attempt_id, kind,
                file_path, content_type, summary_json, retention_days, pinned,
                created_at, updated_at
         from artifacts
         where id = ?`
      )
      .get(id) as DbArtifactRow | undefined;

    if (!row) return undefined;

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      workflowInstanceId: row.workflow_instance_id,
      runAttemptId: row.run_attempt_id,
      kind: row.kind as ArtifactRecord["kind"],
      filePath: row.file_path,
      contentType: row.content_type,
      summary: safeParseJson(row.summary_json),
      retentionDays: row.retention_days,
      pinned: row.pinned === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isDeleted: row.content_type === "deleted" || row.content_type === "expired"
    };
  }

  markExpired(id: string, now: string): void {
    this.db
      .prepare(
        `update artifacts
         set content_type = 'expired',
             summary_json = ?,
             updated_at = ?
         where id = ?`
      )
      .run(
        JSON.stringify({ expired: true, expiredAt: now }),
        now,
        id
      );
  }

  listExpired(now: string): Array<{ id: string; filePath: string; retentionDays: number; pinned: boolean; createdAt: string }> {
    const rows = this.db
      .prepare(
        `select id, file_path, retention_days, pinned, created_at
         from artifacts
         where content_type not in ('deleted', 'expired')
           and pinned = 0
         order by created_at asc`
      )
      .all() as Array<{ id: string; file_path: string; retention_days: number; pinned: 0 | 1; created_at: string }>;

    const nowMs = new Date(now).getTime();

    return rows
      .filter((row) => {
        if (row.retention_days <= 0) return false;
        const createdAtMs = new Date(row.created_at).getTime();
        const retentionMs = row.retention_days * 24 * 60 * 60 * 1000;
        return createdAtMs + retentionMs <= nowMs;
      })
      .map((row) => ({
        id: row.id,
        filePath: row.file_path,
        retentionDays: row.retention_days,
        pinned: row.pinned === 1,
        createdAt: row.created_at
      }));
  }

  listOrphaned(): Array<{ id: string; workspaceId: string; filePath: string }> {
    const rows = this.db
      .prepare(
        `select a.id, a.workspace_id, a.file_path
         from artifacts a
         left join runtime_events re
           on a.workflow_instance_id = re.workflow_instance_id
           and a.run_attempt_id = re.run_attempt_id
         where a.content_type in ('expired', 'deleted')
           and re.id is null`
      )
      .all() as Array<{ id: string; workspace_id: string; file_path: string }>;

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      filePath: row.file_path
    }));
  }

  deletePermanently(id: string): void {
    this.db.prepare(`delete from artifacts where id = ?`).run(id);
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

function safeParseJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

interface DbArtifactRow {
  id: string;
  workspace_id: string;
  workflow_instance_id: string | null;
  run_attempt_id: string | null;
  kind: string;
  file_path: string;
  content_type: string;
  summary_json: string;
  retention_days: number;
  pinned: 0 | 1;
  created_at: string;
  updated_at: string;
}
