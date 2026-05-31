import type { MemoryKind, MemoryScope } from "./memory-models.js";
import { DEFAULT_MEMORY_SCOPE, SCOPE_HIERARCHY } from "./memory-models.js";
import type { MemoryStore } from "./memory-store.js";
import type { PolicyService } from "../security/policy-service.js";
import { randomUUID } from "node:crypto";

export interface ActiveMemorySummary {
  id: string;
  kind: MemoryKind;
  scope: MemoryScope;
  content: string;
}

export interface ProposeMemoryParams {
  workspaceId: string;
  projectId?: string | null;
  scope?: MemoryScope;
  kind: MemoryKind;
  content: string;
  source?: Record<string, unknown>;
  confidence?: number;
  actor?: string;
}

export interface MemorySearchParams {
  workspaceId: string;
  projectId?: string | null;
  scope?: MemoryScope;
  kind?: MemoryKind;
  query?: string;
}

export interface MemoryEventSink {
  emit(input: {
    type: string;
    memoryId: string;
    workspaceId: string;
    scope: MemoryScope;
    payload: Record<string, unknown>;
    now: string;
  }): void;
}

export class MemoryService {
  private readonly policyService?: PolicyService;
  private readonly eventSink?: MemoryEventSink;

  constructor(
    private readonly store: MemoryStore,
    policyService?: PolicyService,
    eventSink?: MemoryEventSink
  ) {
    this.policyService = policyService;
    this.eventSink = eventSink;
  }

  /**
   * Propose a memory record.  Agents use this entry point; it always
   * respects the scope → status policy (ephemeral scopes auto-activate,
   * durable scopes land in pending_approval).  Policy check is performed
   * for workspace-level proposals.
   */
  propose(params: ProposeMemoryParams): { id: string; status: "pending_approval" | "active" } {
    const scope = params.scope ?? DEFAULT_MEMORY_SCOPE;
    const now = new Date().toISOString();

    // Policy check: deny proposals that would be auto-active for
    // durable scopes without proper permissions.
    if (scope !== "run" && scope !== "session") {
      if (this.policyService && params.actor && params.actor !== "system") {
        const decision = this.policyService.evaluate({
          actor: params.actor,
          action: "memory.propose",
          resource: { type: "memory", id: "new" },
          workspaceId: params.workspaceId
        });
        if (decision.kind === "deny") {
          throw Object.assign(
            new Error(`memory propose denied by policy: ${decision.reason}`),
            { code: "PERMISSION_DENIED" }
          );
        }
      }
    }

    const id = `mem_${randomUUID()}`;

    const record = this.store.createCandidate({
      id,
      workspaceId: params.workspaceId,
      projectId: params.projectId ?? null,
      scope,
      kind: params.kind,
      content: params.content,
      source: params.source ?? {},
      confidence: params.confidence ?? 0.5,
      now,
      actor: params.actor ?? null
    });

    return { id: record.id, status: record.status as "pending_approval" | "active" };
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

    this.store.approve(id, now, actor ?? null);
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

    this.store.reject(id, now, actor ?? null);
  }

  /**
   * Revoke an active or pending-approval memory record.
   * Keeps the record (status = revoked) and preserves audit history.
   */
  revoke(id: string, now: string, actor?: string, workspaceId?: string): void {
    const record = this.store.getById(id);
    if (!record) throw new Error(`memory record not found: ${id}`);

    if (this.policyService && actor && workspaceId) {
      const policy = this.policyService.evaluate({
        actor,
        action: "memory.revoke",
        resource: { type: "memory", id },
        workspaceId
      });
      if (policy.kind === "deny") {
        throw Object.assign(
          new Error(`memory revoke denied by policy: ${policy.reason}`),
          { code: "PERMISSION_DENIED" }
        );
      }
    }

    this.store.revoke(id, now, actor ?? null);
  }

  /**
   * Mark all memory records with an expired expiresAt as 'expired'.
   * Records remain in the store (audit preserved).
   */
  expireOlderThan(now: string): number {
    return this.store.expireOlderThan(now);
  }

  searchActive(params: MemorySearchParams): ActiveMemorySummary[] {
    const now = new Date().toISOString();

    // Only apply scope hierarchy filtering when scope is explicitly specified
    const storeOpts: { projectId?: string | null; scopes?: MemoryScope[] } = {
      projectId: params.projectId
    };

    if (params.scope) {
      storeOpts.scopes = SCOPE_HIERARCHY[params.scope];
    }

    const allActive = this.store.listActive(params.workspaceId, storeOpts);

    let results = allActive;

    if (params.kind) {
      results = results.filter((m) => m.kind === params.kind);
    }
    if (params.query) {
      const lower = params.query.toLowerCase();
      results = results.filter((m) => m.content.toLowerCase().includes(lower));
    }

    // Emit memory.scope_resolved for each consumed record
    if (this.eventSink) {
      for (const m of results) {
        this.eventSink.emit({
          type: "memory.scope_resolved",
          memoryId: m.id,
          workspaceId: params.workspaceId,
          scope: m.scope,
          payload: { resolvedScope: params.scope ?? null, visibleScopes: storeOpts.scopes ?? null },
          now
        });
      }
    }

    return results.map((m) => ({
      id: m.id,
      kind: m.kind,
      scope: m.scope,
      content: m.content
    }));
  }
}
