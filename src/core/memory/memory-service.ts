import type { MemoryKind, MemoryScope } from "./memory-models.js";
import type { MemoryStore } from "./memory-store.js";

export interface ActiveMemorySummary {
  id: string;
  kind: MemoryKind;
  scope: MemoryScope;
  content: string;
}

export interface MemorySearchParams {
  workspaceId: string;
  projectId?: string | null;
  scope?: MemoryScope;
  kind?: MemoryKind;
  query?: string;
}

export class MemoryService {
  constructor(private readonly store: MemoryStore) {}

  approve(id: string, now: string): void {
    const record = this.store.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);
    if (record.status !== "pending_approval") {
      throw new Error(`memory record is not pending approval: ${id} status=${record.status}`);
    }
    this.store.approve(id, now);
  }

  reject(id: string, now: string): void {
    const record = this.store.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);
    if (record.status !== "pending_approval") {
      throw new Error(`memory record is not pending approval: ${id} status=${record.status}`);
    }
    this.store.reject(id, now);
  }

  searchActive(params: MemorySearchParams): ActiveMemorySummary[] {
    const allActive = this.store.listActive(params.workspaceId);
    let results = allActive;

    if (params.scope) {
      results = results.filter((m) => m.scope === params.scope);
    }
    if (params.kind) {
      results = results.filter((m) => m.kind === params.kind);
    }
    if (params.query) {
      const lower = params.query.toLowerCase();
      results = results.filter((m) => m.content.toLowerCase().includes(lower));
    }

    return results.map((m) => ({
      id: m.id,
      kind: m.kind,
      scope: m.scope,
      content: m.content
    }));
  }
}
