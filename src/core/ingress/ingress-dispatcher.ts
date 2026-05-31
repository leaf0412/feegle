import type { IdentityResolverPort } from "./identity-resolver.js";
import type { IntentResolverRegistry } from "./intent-resolver-registry.js";
import type { PermissionPolicyPort } from "./permission-policy.js";
import type { ResolvedInteractionContext } from "./resolved-context.js";
import type { TriggerEvent } from "./trigger-event.js";
import type { WorkspaceResolverPort } from "./workspace-resolver.js";
import type { WorkflowSelector } from "./workflow-selector.js";

export interface IngressEventSink {
  emit(input: {
    id: string;
    workspaceId: string;
    workflowInstanceId: string | null;
    runAttemptId: string | null;
    category: string;
    type: string;
    payload: unknown;
    now: string;
  }): void;
}

export interface IngressWorkflowRuntime {
  start(input: {
    workflowInstanceId: string;
    runAttemptId: string;
    workspaceId: string;
    projectId: string | null;
    definitionId: string;
    input: unknown;
    now: string;
  }): Promise<{ status: "succeeded" | "failed" | "waiting" | "queued" | "skipped"; error?: import("@core/runtime/runtime-models.js").RuntimeError }>;
}

/**
 * Provides a per-plugin default workspace when conversation binding resolution
 * fails. Each plugin can register its configured default workspace so the
 * ingress pipeline can fall back from conversation binding to a known operator
 * workspace instead of a hardcoded ID.
 */
export interface PluginDefaultWorkspaceResolver {
  resolveDefaultWorkspace(pluginId: string): string | undefined;
}

export interface IngressDeps {
  identityResolver: IdentityResolverPort;
  workspaceResolver: WorkspaceResolverPort;
  permissionPolicy: PermissionPolicyPort;
  intentResolvers: IntentResolverRegistry;
  workflowSelector: WorkflowSelector;
  workflowRuntime: IngressWorkflowRuntime;
  eventSink: IngressEventSink;
  pluginDefaultWorkspace?: PluginDefaultWorkspaceResolver;
  idFactory: { workflowInstanceId(): string; runAttemptId(): string };
  clock: { nowIso(): string };
}

export interface EnrichedIngressContext {
  identity: ReturnType<IdentityResolverPort["resolve"]>;
  workspace: ReturnType<WorkspaceResolverPort["resolve"]>;
  permission: ReturnType<PermissionPolicyPort["checkPermission"]> | null;
  policy: ReturnType<PermissionPolicyPort["decide"]> | null;
}

const UNRESOLVED_WORKSPACE_PLACEHOLDER = "unresolved";

export class IngressDispatcher {
  constructor(private readonly deps: IngressDeps) {}

  async dispatch(event: TriggerEvent): Promise<{ status: "succeeded" | "failed" | "waiting" | "queued" | "skipped"; reason?: string }> {
    const now = this.deps.clock.nowIso();

    const resolvedIdentity = this.deps.identityResolver.resolve(event.actorHint ?? undefined);
    const systemActorKind = getTrustedSystemActorKind(event.actorHint);
    const identity = resolvedIdentity.status === "unknown" && systemActorKind
      ? {
          status: "resolved" as const,
          userId: `system:${systemActorKind}`,
          displayName: systemActorKind,
          externalIdentity: { provider: "system", externalId: systemActorKind }
        }
      : resolvedIdentity;
    this.emitDiagnostic(event, "ingress.identity_resolved", { status: identity.status }, UNRESOLVED_WORKSPACE_PLACEHOLDER, now);
    if (identity.status !== "resolved") {
      const reason = identity.status === "unknown" ? identity.reason : "identity resolution failed";
      this.emitDiagnostic(event, "ingress.identity_unresolved", {
        pluginId: event.source.pluginId,
        reason
      }, UNRESOLVED_WORKSPACE_PLACEHOLDER, now);
      return { status: "failed", reason: `identity unresolved: ${reason}` };
    }

    const workspace = this.deps.workspaceResolver.resolve(event.conversationHint ?? undefined);
    const resolvedWorkspaceId =
      workspace.status === "resolved"
        ? workspace.workspaceId
        : this.deps.pluginDefaultWorkspace?.resolveDefaultWorkspace(event.source.pluginId);

    this.emitDiagnostic(
      event,
      "ingress.workspace_resolved",
      { status: workspace.status, resolvedWorkspaceId: resolvedWorkspaceId ?? null },
      resolvedWorkspaceId ?? UNRESOLVED_WORKSPACE_PLACEHOLDER,
      now
    );

    // Fail explicitly when workspace is missing and no default is configured.
    if (!resolvedWorkspaceId) {
      this.emitDiagnostic(event, "ingress.workspace_unresolved", {
        pluginId: event.source.pluginId,
        reason: workspace.status === "missing_binding" ? workspace.reason : "no workspace binding or default"
      }, UNRESOLVED_WORKSPACE_PLACEHOLDER, now);
      return { status: "failed" };
    }

    let permission = null;
    let policy = null;
    permission = this.deps.permissionPolicy.checkPermission(
      resolvedWorkspaceId,
      identity.userId
    );
    this.emitDiagnostic(
      event,
      "ingress.permission_checked",
      { allowed: permission.allowed, role: permission.role },
      resolvedWorkspaceId,
      now
    );

    // Determine intent kind for policy. The intent resolver hasn't run yet,
    // so default to "chat". The policy layer can refine this later.
    policy = this.deps.permissionPolicy.decide(permission, "chat");
    this.emitDiagnostic(
      event,
      "ingress.policy_decided",
      { kind: policy.kind, reason: "reason" in policy ? policy.reason : undefined },
      resolvedWorkspaceId,
      now
    );

    if (policy.kind === "deny") {
      return { status: "failed", reason: "reason" in policy ? policy.reason : undefined };
    }

    const enrichedEvent: TriggerEvent = {
      ...event,
      external: {
        ...event.external,
        resolvedWorkspaceId,
        resolvedProjectId: workspace.status === "resolved" ? workspace.projectId : null
      }
    };

    const intent = await this.deps.intentResolvers.resolve(enrichedEvent);
    const selected = this.deps.workflowSelector.select(intent);

    // Build resolved interaction context so downstream consumers don't need
    // their own fallback logic.
    const resolvedContext: ResolvedInteractionContext = {
      workspaceId: resolvedWorkspaceId,
      projectId: workspace.status === "resolved" ? workspace.projectId : null,
      userId: identity.userId,
      externalIdentity: identity.externalIdentity,
      sourcePlugin: event.source.pluginId,
      sourceId: event.triggerEventId
    };

    return this.deps.workflowRuntime.start({
      workflowInstanceId: this.deps.idFactory.workflowInstanceId(),
      runAttemptId: this.deps.idFactory.runAttemptId(),
      workspaceId: resolvedContext.workspaceId,
      projectId: resolvedContext.projectId,
      definitionId: selected.definitionId,
      input: intent.payload,
      now
    });
  }

  private emitDiagnostic(
    event: TriggerEvent,
    type: string,
    payload: unknown,
    workspaceId: string,
    now: string
  ): void {
    this.deps.eventSink.emit({
      id: `${event.triggerEventId}:${type.replace(/\./g, "_")}`,
      workspaceId,
      workflowInstanceId: null,
      runAttemptId: null,
      category: "diagnostic",
      type,
      payload,
      now
    });
  }
}

function getTrustedSystemActorKind(actorHint: Record<string, unknown> | undefined): string | null {
  if (!actorHint) return null;
  const kind = actorHint.kind;
  return kind === "system" || kind === "scheduler" ? kind : null;
}
