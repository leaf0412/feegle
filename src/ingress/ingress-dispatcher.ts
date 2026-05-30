import type { IdentityResolverPort } from "./identity-resolver.js";
import type { IntentResolverRegistry } from "./intent-resolver-registry.js";
import type { PermissionPolicyPort } from "./permission-policy.js";
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
  }): Promise<{ status: "succeeded" | "failed" | "waiting" }>;
}

export interface IngressDeps {
  identityResolver: IdentityResolverPort;
  workspaceResolver: WorkspaceResolverPort;
  permissionPolicy: PermissionPolicyPort;
  intentResolvers: IntentResolverRegistry;
  workflowSelector: WorkflowSelector;
  workflowRuntime: IngressWorkflowRuntime;
  eventSink: IngressEventSink;
  idFactory: { workflowInstanceId(): string; runAttemptId(): string };
  clock: { nowIso(): string };
}

export interface EnrichedIngressContext {
  identity: ReturnType<IdentityResolverPort["resolve"]>;
  workspace: ReturnType<WorkspaceResolverPort["resolve"]>;
  permission: ReturnType<PermissionPolicyPort["checkPermission"]> | null;
  policy: ReturnType<PermissionPolicyPort["decide"]> | null;
}

const FALLBACK_WORKSPACE_ID = "ws_personal";

export class IngressDispatcher {
  constructor(private readonly deps: IngressDeps) {}

  async dispatch(event: TriggerEvent): Promise<{ status: "succeeded" | "failed" | "waiting" }> {
    const now = this.deps.clock.nowIso();
    const workspaceId = this.deps.idFactory.workflowInstanceId()
      ? FALLBACK_WORKSPACE_ID
      : FALLBACK_WORKSPACE_ID;

    const identity = this.deps.identityResolver.resolve(event.actorHint ?? undefined);
    this.emitDiagnostic(event, "ingress.identity_resolved", { status: identity.status }, workspaceId, now);

    const workspace = this.deps.workspaceResolver.resolve(event.conversationHint ?? undefined);
    this.emitDiagnostic(event, "ingress.workspace_resolved", { status: workspace.status }, workspaceId, now);

    let permission = null;
    let policy = null;
    if (identity.status === "resolved" && workspace.status === "resolved") {
      permission = this.deps.permissionPolicy.checkPermission(
        workspace.workspaceId,
        identity.userId
      );
      this.emitDiagnostic(
        event,
        "ingress.permission_checked",
        { allowed: permission.allowed, role: permission.role },
        workspace.workspaceId,
        now
      );

      // Determine intent kind for policy. The intent resolver hasn't run yet,
      // so default to "chat". The policy layer can refine this later.
      policy = this.deps.permissionPolicy.decide(permission, "chat");
      this.emitDiagnostic(
        event,
        "ingress.policy_decided",
        { kind: policy.kind },
        workspace.workspaceId,
        now
      );

      if (policy.kind === "deny") {
        return { status: "failed" };
      }
    }

    // Build enriched context for intent resolvers
    const enrichedEvent: TriggerEvent = {
      ...event
    };

    const intent = await this.deps.intentResolvers.resolve(enrichedEvent);
    const selected = this.deps.workflowSelector.select(intent);

    return this.deps.workflowRuntime.start({
      workflowInstanceId: this.deps.idFactory.workflowInstanceId(),
      runAttemptId: this.deps.idFactory.runAttemptId(),
      workspaceId: intent.workspaceId,
      projectId: intent.projectId,
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
