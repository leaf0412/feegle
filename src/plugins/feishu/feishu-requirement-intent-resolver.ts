import type { Intent, IntentKind } from "@core/ingress/intent.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";

const REQUIREMENT_DOC_PREFIXES = ["需求文档：", "需求:"];
const FEISHU_DOC_SUBSTRINGS = ["/docx/", "feishu.cn/docx", "larksuite.com/docx"];

export function isRequirementMessage(text: string): boolean {
  const trimmed = text.trim();
  for (const prefix of REQUIREMENT_DOC_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return true;
    }
  }
  for (const substring of FEISHU_DOC_SUBSTRINGS) {
    if (trimmed.includes(substring)) {
      return true;
    }
  }
  return false;
}

export const feishuRequirementActionTypes = [
  "requirement_plan_approve",
  "requirement_plan_revise",
  "requirement_plan_back",
  "requirement_verify",
  "requirement_accept",
  "requirement_cancel"
] as const;

export type FeishuRequirementActionType = (typeof feishuRequirementActionTypes)[number];

export function isFeishuRequirementActionType(value: unknown): value is FeishuRequirementActionType {
  return typeof value === "string" && (feishuRequirementActionTypes as readonly string[]).includes(value);
}

export interface ResolveFeishuRequirementCardActionIntentInput {
  triggerEventId: string;
  resolvedWorkspaceId: string;
  resolvedProjectId: string | null;
  resolvedUserId: string;
  sourcePlugin: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  chatId: string;
  messageId: string;
  conversationKey?: string;
}

export function resolveFeishuRequirementCardActionIntent(
  input: ResolveFeishuRequirementCardActionIntentInput
): Intent | undefined {
  if (!isFeishuRequirementActionType(input.actionType)) {
    return undefined;
  }
  return {
    intentId: `intent:${input.triggerEventId}`,
    kind: input.actionType as IntentKind,
    workspaceId: input.resolvedWorkspaceId,
    projectId: input.resolvedProjectId,
    actor: { kind: "user", userId: input.resolvedUserId },
    payload: {
      sourcePlugin: input.sourcePlugin,
      workspaceId: input.resolvedWorkspaceId,
      projectId: input.resolvedProjectId,
      requesterUserId: input.resolvedUserId,
      ...input.actionPayload,
      chatId: input.chatId,
      messageId: input.messageId,
      // the clicked card's message id — renderers update THIS card in place
      // (single evolving card) rather than sending a new message. Text intake
      // carries no cardMessageId, so its plan_review render sends a fresh card.
      cardMessageId: input.messageId,
      conversationKey: input.conversationKey ?? `feishu:${input.chatId}`
    }
  };
}

export interface ResolveFeishuRequirementIntentInput {
  triggerEventId: string;
  resolvedWorkspaceId: string;
  resolvedProjectId: string | null;
  resolvedUserId: string;
  sourcePlugin: string;
  commandType: string;
  chatId: string;
  messageId: string;
  conversationKey: string;
  text: string;
  requirementId?: string;
}

export function resolveFeishuRequirementIntent(input: ResolveFeishuRequirementIntentInput): Intent {
  const hasRequirementId = typeof input.requirementId === "string" && input.requirementId.length > 0;

  if (hasRequirementId) {
    return {
      intentId: `intent:${input.triggerEventId}`,
      kind: "requirement_plan_revise",
      workspaceId: input.resolvedWorkspaceId,
      projectId: input.resolvedProjectId,
      actor: { kind: "user", userId: input.resolvedUserId },
      payload: {
        sourcePlugin: input.sourcePlugin,
        workspaceId: input.resolvedWorkspaceId,
        projectId: input.resolvedProjectId,
        requesterUserId: input.resolvedUserId,
        requirementId: input.requirementId,
        feedback: input.text,
        chatId: input.chatId,
        messageId: input.messageId,
        conversationKey: input.conversationKey,
        commandType: input.commandType
      }
    };
  }

  return {
    intentId: `intent:${input.triggerEventId}`,
    kind: "requirement_intake",
    workspaceId: input.resolvedWorkspaceId,
    projectId: input.resolvedProjectId,
    actor: { kind: "user", userId: input.resolvedUserId },
    payload: {
      sourcePlugin: input.sourcePlugin,
      workspaceId: input.resolvedWorkspaceId,
      projectId: input.resolvedProjectId,
      requesterUserId: input.resolvedUserId,
      requirementText: input.text,
      chatId: input.chatId,
      messageId: input.messageId,
      conversationKey: input.conversationKey,
      commandType: input.commandType
    }
  };
}

export function registerFeishuRequirementIntentResolvers(registry: IntentResolverRegistry): void {
  registry.register({
    id: "feishu-requirement-message",
    canResolve(event: TriggerEvent): boolean {
      if (event.source.pluginId !== "feishu" || event.source.triggerType !== "message") {
        return false;
      }
      const raw = event.external.raw;
      return typeof raw === "string" && isRequirementMessage(raw);
    },
    resolve(event: TriggerEvent): Intent {
      const resolvedWorkspaceId = event.external.resolvedWorkspaceId;
      if (typeof resolvedWorkspaceId !== "string" || resolvedWorkspaceId.length === 0) {
        throw new Error("resolved workspaceId missing from trigger event");
      }
      const resolvedProjectId = typeof event.external.resolvedProjectId === "string"
        ? event.external.resolvedProjectId
        : null;
      const resolvedUserId = event.external.resolvedUserId;
      if (typeof resolvedUserId !== "string" || resolvedUserId.length === 0) {
        throw new Error("resolved userId missing from trigger event");
      }
      const chatId = event.external.chatId;
      if (typeof chatId !== "string" || chatId.length === 0) {
        throw new Error("chatId missing from trigger event");
      }
      const messageId = event.external.messageId;
      if (typeof messageId !== "string" || messageId.length === 0) {
        throw new Error("messageId missing from trigger event");
      }
      const commandType = typeof event.external.commandType === "string"
        ? event.external.commandType
        : "chat";
      const raw = event.external.raw as string;
      const requirementId = typeof event.external.requirementId === "string"
        ? event.external.requirementId
        : undefined;

      return resolveFeishuRequirementIntent({
        triggerEventId: event.triggerEventId,
        resolvedWorkspaceId,
        resolvedProjectId,
        resolvedUserId,
        sourcePlugin: "feishu",
        commandType,
        chatId,
        messageId,
        conversationKey: (event.conversationHint?.conversationKey as string) ?? `feishu:${chatId}`,
        text: raw,
        requirementId
      });
    }
  });

  registry.register({
    id: "feishu-requirement-card-action",
    canResolve(event: TriggerEvent): boolean {
      return (
        event.source.pluginId === "feishu" &&
        event.source.triggerType === "card_action" &&
        isFeishuRequirementActionType(event.external.actionType)
      );
    },
    resolve(event: TriggerEvent): Intent {
      const resolvedWorkspaceId = event.external.resolvedWorkspaceId;
      if (typeof resolvedWorkspaceId !== "string" || resolvedWorkspaceId.length === 0) {
        throw new Error("resolved workspaceId missing from trigger event");
      }
      const resolvedProjectId = typeof event.external.resolvedProjectId === "string"
        ? event.external.resolvedProjectId
        : null;
      const resolvedUserId = event.external.resolvedUserId;
      if (typeof resolvedUserId !== "string" || resolvedUserId.length === 0) {
        throw new Error("resolved userId missing from trigger event");
      }
      const chatId = event.external.chatId;
      if (typeof chatId !== "string" || chatId.length === 0) {
        throw new Error("chatId missing from trigger event");
      }
      const messageId = event.external.messageId;
      if (typeof messageId !== "string" || messageId.length === 0) {
        throw new Error("messageId missing from trigger event");
      }
      const actionPayload = (event.external.actionPayload as Record<string, unknown>) ?? {};
      const conversationKey = typeof event.conversationHint?.conversationKey === "string"
        ? event.conversationHint.conversationKey
        : undefined;

      const intent = resolveFeishuRequirementCardActionIntent({
        triggerEventId: event.triggerEventId,
        resolvedWorkspaceId,
        resolvedProjectId,
        resolvedUserId,
        sourcePlugin: "feishu",
        actionType: event.external.actionType as string,
        actionPayload,
        chatId,
        messageId,
        conversationKey
      });

      if (!intent) {
        throw new Error(`Unhandled feishu requirement card action: ${String(event.external.actionType)}`);
      }

      return intent;
    }
  });
}
