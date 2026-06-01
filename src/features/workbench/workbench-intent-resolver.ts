import type { Intent } from "@core/ingress/intent.js";
import type { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { parsePlatformAction } from "@platform/platform-action.js";

export const workbenchCardWorkflowId = "workbench.card";

const SLUG_TO_BUTTON: Record<string, string> = {
  manage_repos: "manage_repos",
  discuss: "discuss_requirement",
  revise_requirement: "revise_requirement",
  generate_plan: "generate_plan",
  revise_plan: "revise_plan",
  delete_requirement: "delete_requirement",
  delete_plan: "delete_plan"
};

function extractWorkbenchAction(event: TriggerEvent):
  | { chatId: string; messageId: string; button: string; payload: string | undefined }
  | null {
  if (event.source.pluginId !== "feishu" || event.source.triggerType !== "card_action") {
    return null;
  }
  if (event.external.actionType !== "platform_action") {
    return null;
  }
  // actionPayload is the full FeishuCommand: { type, action, sessionKey? }.
  // The 'action' field (a PlatformCommandAction) has: { kind, command, args, raw }.
  const actionPayload = event.external.actionPayload as Record<string, unknown> | undefined;
  const inner = actionPayload?.action as Record<string, unknown> | undefined;
  if (!inner || inner.kind !== "act" || inner.command !== "/workbench") {
    return null;
  }
  const rawArgs = typeof inner.args === "string" ? inner.args : "";
  const [slug = "", ...rest] = rawArgs.split(/\s+/);
  const button = SLUG_TO_BUTTON[slug];
  if (!button) {
    return null;
  }
  const chatId = event.external.chatId;
  const messageId = event.external.messageId;
  if (typeof chatId !== "string" || typeof messageId !== "string") {
    return null;
  }
  return {
    chatId,
    messageId,
    button,
    payload: rest.join(" ") || undefined
  };
}

export function registerWorkbenchIntentResolver(registry: IntentResolverRegistry): void {
  // Card action resolver: intercepts workbench button clicks BEFORE generic card_action resolver.
  registry.register({
    id: "workbench-card-action",
    canResolve(event: TriggerEvent): boolean {
      return extractWorkbenchAction(event) !== null;
    },
    resolve(event: TriggerEvent): Intent {
      const info = extractWorkbenchAction(event)!;
      const resolvedWorkspaceId = event.external.resolvedWorkspaceId;
      if (typeof resolvedWorkspaceId !== "string" || resolvedWorkspaceId.length === 0) {
        throw new Error("resolved workspaceId missing from trigger event");
      }
      const resolvedUserId = event.external.resolvedUserId;
      if (typeof resolvedUserId !== "string" || resolvedUserId.length === 0) {
        throw new Error("resolved userId missing from trigger event");
      }
      return {
        intentId: `intent:${event.triggerEventId}`,
        kind: "workbench_action",
        workspaceId: resolvedWorkspaceId,
        projectId: typeof event.external.resolvedProjectId === "string"
          ? event.external.resolvedProjectId
          : null,
        actor: { kind: "user", userId: resolvedUserId },
        payload: {
          sourcePlugin: "feishu",
          chatId: info.chatId,
          messageId: info.messageId,
          button: info.button,
          payload: info.payload,
          conversationKey: `feishu:${info.chatId}`
        }
      };
    }
  });

  // Chat message resolver: intercepts user text messages for workbench card.
  registry.register({
    id: "workbench-card",
    canResolve(event: TriggerEvent): boolean {
      if (event.source.pluginId !== "feishu" || event.source.triggerType !== "message") {
        return false;
      }
      const chatId = event.external.chatId;
      return typeof chatId === "string" && chatId.length > 0;
    },
    resolve(event: TriggerEvent): Intent {
      const chatId = event.external.chatId as string;
      const resolvedWorkspaceId = event.external.resolvedWorkspaceId;
      if (typeof resolvedWorkspaceId !== "string" || resolvedWorkspaceId.length === 0) {
        throw new Error("resolved workspaceId missing from trigger event");
      }
      const resolvedUserId = event.external.resolvedUserId;
      if (typeof resolvedUserId !== "string" || resolvedUserId.length === 0) {
        throw new Error("resolved userId missing from trigger event");
      }
      const messageId = event.external.messageId;
      if (typeof messageId !== "string" || messageId.length === 0) {
        throw new Error("messageId missing from trigger event");
      }
      return {
        intentId: `intent:${event.triggerEventId}`,
        kind: "workbench_card",
        workspaceId: resolvedWorkspaceId,
        projectId: typeof event.external.resolvedProjectId === "string"
          ? event.external.resolvedProjectId
          : null,
        actor: { kind: "user", userId: resolvedUserId },
        payload: {
          sourcePlugin: "feishu",
          chatId,
          messageId,
          conversationKey: `feishu:${chatId}`
        }
      };
    }
  });
}

export function registerWorkbenchCardWorkflowSelector(selector: WorkflowSelector): void {
  selector.register({
    id: "workbench-card",
    matches: (intent) => intent.kind === "workbench_card",
    definitionId: workbenchCardWorkflowId
  });
  selector.register({
    id: "workbench-action",
    matches: (intent) => intent.kind === "workbench_action",
    definitionId: workbenchCardWorkflowId
  });
}
