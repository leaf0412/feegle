import type { MemoryKind, MemoryScope } from "./memory-models.js";
import type { MemoryStore } from "./memory-store.js";
import type { PolicyService } from "../security/policy-service.js";

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
  private readonly policyService?: PolicyService;

  constructor(
    private readonly store: MemoryStore,
    policyService?: PolicyService
  ) {
    this.policyService = policyService;
  }

  approve(id: string, now: string, actor?: string, workspaceId?: string): void {
    const record = this.store.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);
    if (record.status !== "pending_approval") {
      throw new Error(`memory record is not pending approval: ${id} status=${record.status}`);
    }

    // Policy check: deny approval if actor lacks permission
    if (this.policyService && actor && workspaceId) {
      const policy = this.policyService.evaluate({
        actor,
        action: "memory.approve",
        resource: { type: "memory", id },
        workspaceId
      });
      if (policy.kind === "deny") {
        throw Object.assign(
          new Error(`memory approve denied by policy: ${policy.reason}`),
          { code: "PERMISSION_DENIED" }
        );
      }
    }

    this.store.approve(id, now);
  }

  reject(id: string, now: string, actor?: string, workspaceId?: string): void {
    const record = this.store.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);
    if (record.status !== "pending_approval") {
      throw new Error(`memory record is not pending approval: ${id} status=${record.status}`);
    }

    // Policy check: deny rejection if actor lacks permission
    if (this.policyService && actor && workspaceId) {
      const policy = this.policyService.evaluate({
        actor,
        action: "memory.reject",
        resource: { type: "memory", id },
        workspaceId
      });
      if (policy.kind === "deny") {
        throw Object.assign(
          new Error(`memory reject denied by policy: ${policy.reason}`),
          { code: "PERMISSION_DENIED" }
        );
      }
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
