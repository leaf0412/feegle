import type { RuntimeDb } from "../../infra/app/runtime-db.js";
import type { MemoryKind, MemoryRecord, MemoryScope, MemoryStatus } from "./memory-models.js";

export class MemoryStore {
  constructor(private readonly db: RuntimeDb) {}

  createCandidate(input: {
    id: string;
    workspaceId: string;
    projectId?: string | null;
    scope: MemoryScope;
    kind: MemoryKind;
    content: string;
    source: Record<string, unknown>;
    confidence: number;
    now: string;
  }): MemoryRecord {
    const record: MemoryRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      scope: input.scope,
      kind: input.kind,
      status: input.scope === "run" || input.scope === "session" ? "active" : "pending_approval",
      content: input.content,
      source: input.source,
      confidence: input.confidence,
      visibility: input.projectId ? "project" : "workspace",
      expiresAt: null,
      createdAt: input.now,
      updatedAt: input.now
    };

    this.db
      .prepare(
        `insert into memory_records
          (
            id, workspace_id, project_id, scope, kind, status, content,
            source_json, confidence, visibility, expires_at, created_at, updated_at
          )
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.workspaceId,
        record.projectId,
        record.scope,
        record.kind,
        record.status,
        record.content,
        JSON.stringify(record.source),
        record.confidence,
        record.visibility,
        record.expiresAt,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  approve(id: string, now: string): void {
    this.db
      .prepare(`update memory_records set status = 'active', updated_at = ? where id = ?`)
      .run(now, id);
  }

  reject(id: string, now: string): void {
    this.db
      .prepare(`update memory_records set status = 'rejected', updated_at = ? where id = ?`)
      .run(now, id);
  }

  delete(id: string): void {
    this.db
      .prepare(`delete from memory_records where id = ?`)
      .run(id);
  }

  getById(id: string): MemoryRecord | undefined {
    const row = this.db
      .prepare(
        `select id, workspace_id, project_id, scope, kind, status, content, source_json, confidence, visibility, expires_at, created_at, updated_at
         from memory_records where id = ?`
      )
      .get(id) as DbMemoryRow | undefined;

    return row ? mapMemoryRow(row) : undefined;
  }

  listActive(workspaceId: string): Array<{ id: string; kind: MemoryKind; scope: MemoryScope; content: string }> {
    const rows = this.db
      .prepare(
        `select id, kind, scope, content
         from memory_records
         where workspace_id = ? and status = 'active'
         order by created_at desc`
      )
      .all(workspaceId) as Array<{ id: string; kind: MemoryKind; scope: MemoryScope; content: string }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      scope: row.scope,
      content: row.content
    }));
  }
}

interface DbMemoryRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  scope: MemoryScope;
  kind: MemoryKind;
  status: MemoryStatus;
  content: string;
  source_json: string;
  confidence: number;
  visibility: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapMemoryRow(row: DbMemoryRow): MemoryRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    scope: row.scope,
    kind: row.kind,
    status: row.status as MemoryStatus,
    content: row.content,
    source: JSON.parse(row.source_json) as Record<string, unknown>,
    confidence: row.confidence,
    visibility: row.visibility as "workspace" | "project" | "private",
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
