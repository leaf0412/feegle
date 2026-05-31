import type { RuntimeDb } from "@infra/app/runtime-db.js";
import type { MemoryHistoryEntry, MemoryKind, MemoryRecord, MemoryScope, MemoryStatus } from "./memory-models.js";
import { randomUUID } from "node:crypto";

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
    actor?: string | null;
  }): MemoryRecord {
    const status: MemoryStatus =
      input.scope === "run" || input.scope === "session" ? "active" : "pending_approval";

    const record: MemoryRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      scope: input.scope,
      kind: input.kind,
      status,
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

    this.recordHistory({
      memoryId: record.id,
      fromStatus: null,
      toStatus: status,
      actor: input.actor ?? null,
      now: input.now
    });

    return record;
  }

  approve(id: string, now: string, actor?: string | null): void {
    const record = this.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);

    this.db
      .prepare(`update memory_records set status = 'active', updated_at = ? where id = ?`)
      .run(now, id);

    this.recordHistory({
      memoryId: id,
      fromStatus: record.status,
      toStatus: "active",
      actor: actor ?? null,
      now
    });
  }

  reject(id: string, now: string, actor?: string | null): void {
    const record = this.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);

    this.db
      .prepare(`update memory_records set status = 'rejected', updated_at = ? where id = ?`)
      .run(now, id);

    this.recordHistory({
      memoryId: id,
      fromStatus: record.status,
      toStatus: "rejected",
      actor: actor ?? null,
      now
    });
  }

  revoke(id: string, now: string, actor?: string | null): void {
    const record = this.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);
    if (record.status === "revoked") {
      throw new Error(`memory record already revoked: ${id}`);
    }

    this.db
      .prepare(`update memory_records set status = 'revoked', updated_at = ? where id = ?`)
      .run(now, id);

    this.recordHistory({
      memoryId: id,
      fromStatus: record.status,
      toStatus: "revoked",
      actor: actor ?? null,
      now
    });
  }

  expireOlderThan(now: string, _actor?: string | null): number {
    // Find all active records with expires_at <= now and that are not already expired/revoked/rejected
    const rows = this.db
      .prepare(
        `select id, status from memory_records
         where expires_at is not null and expires_at <= ?
         and status not in ('expired', 'revoked', 'rejected')`
      )
      .all(now) as Array<{ id: string; status: MemoryStatus }>;

    const update = this.db.prepare(
      `update memory_records set status = 'expired', updated_at = ? where id = ?`
    );

    let count = 0;
    const expiredAt = now;

    for (const row of rows) {
      update.run(expiredAt, row.id);
      this.recordHistory({
        memoryId: row.id,
        fromStatus: row.status,
        toStatus: "expired",
        actor: _actor ?? null,
        now: expiredAt
      });
      count++;
    }

    return count;
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

  getHistory(memoryId: string): MemoryHistoryEntry[] {
    const rows = this.db
      .prepare(
        `select id, memory_id, from_status, to_status, actor, created_at
         from memory_record_history
         where memory_id = ?
         order by created_at asc`
      )
      .all(memoryId) as DbHistoryRow[];

    return rows.map(mapHistoryRow);
  }

  listActive(
    workspaceId: string,
    opts?: { projectId?: string | null; scopes?: MemoryScope[] }
  ): Array<{ id: string; kind: MemoryKind; scope: MemoryScope; content: string; projectId: string | null }> {
    let sql = `select id, kind, scope, content, project_id
               from memory_records
               where workspace_id = ? and status = 'active'`;

    const params: unknown[] = [workspaceId];

    if (opts?.projectId !== undefined) {
      if (opts.projectId === null) {
        sql += ` and project_id is null`;
      } else {
        sql += ` and project_id = ?`;
        params.push(opts.projectId);
      }
    }

    if (opts?.scopes && opts.scopes.length > 0) {
      const placeholders = opts.scopes.map(() => "?").join(", ");
      sql += ` and scope in (${placeholders})`;
      params.push(...opts.scopes);
    }

    sql += ` order by created_at desc`;

    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      kind: MemoryKind;
      scope: MemoryScope;
      content: string;
      project_id: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      scope: row.scope,
      content: row.content,
      projectId: row.project_id
    }));
  }

  private recordHistory(input: {
    memoryId: string;
    fromStatus: MemoryStatus | null;
    toStatus: MemoryStatus;
    actor: string | null;
    now: string;
  }): void {
    const id = randomUUID();
    this.db
      .prepare(
        `insert into memory_record_history
          (id, memory_id, from_status, to_status, actor, created_at)
         values (?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.memoryId, input.fromStatus, input.toStatus, input.actor, input.now);
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

interface DbHistoryRow {
  id: string;
  memory_id: string;
  from_status: string | null;
  to_status: string;
  actor: string | null;
  created_at: string;
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

function mapHistoryRow(row: DbHistoryRow): MemoryHistoryEntry {
  return {
    id: row.id,
    memoryId: row.memory_id,
    fromStatus: (row.from_status as MemoryStatus | null) ?? null,
    toStatus: row.to_status as MemoryStatus,
    actor: row.actor,
    createdAt: row.created_at
  };
}
