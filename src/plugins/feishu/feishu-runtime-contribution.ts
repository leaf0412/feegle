import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { AgentConversationResult } from "@core/agent-conversation/agent-conversation-models.js";
import type { IntentKind } from "@core/ingress/intent.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { renderFeishuAgentConversationResult } from "./feishu-agent-conversation-renderer.js";
import { registerFeishuRequirementIntentResolvers } from "./feishu-requirement-intent-resolver.js";
import { registerFeishuRequirementRenderEffects } from "./feishu-requirement-renderer.js";

function intentKindFromEvent(event: TriggerEvent): IntentKind {
  const commandType = event.external.commandType;
  if (typeof commandType === "string" && commandType === "chat") {
    return "chat";
  }
  return "slash_command";
}

function intentPayloadSource(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const sourcePlugin = (payload as Record<string, unknown>).sourcePlugin;
  return typeof sourcePlugin === "string" ? sourcePlugin : undefined;
}

function feishuPayloadFromEvent(event: TriggerEvent): Record<string, unknown> {
  return {
    ...event.external,
    sourcePlugin: "feishu",
    conversationKey: event.conversationHint?.conversationKey,
    text: textFromEvent(event)
  };
}

function textFromEvent(event: TriggerEvent): string | undefined {
  const raw = event.external.raw;
  if (typeof raw === "string") {
    return raw;
  }
  const commandText = event.external.commandText;
  return typeof commandText === "string" ? commandText : undefined;
}

const WORKBENCH_ACTIONS = new Set([
  "workbench_plan_approve",
  "workbench_plan_reject",
  "workbench_plan_cancel",
  "workbench_plan_push",
  "workbench_plan_cleanup",
  "workbench_plan_revise",
  "workbench_plan_revision_submit",
  "workbench_plan_revise_execution",
  "workbench_plan_revise_execution_submit",
  "workbench_plan_base_branch_submit"
]);

export function feishuRuntimeContribution(client: FeishuClientPort): RuntimeContributionModule {
  return {
    id: "feishu-runtime",
    register: (ctx) => {
      // --- Intent resolvers ---

      // Requirement message events: claim before feishu-message so requirement
      // texts are routed to requirement_intake rather than agent chat.
      registerFeishuRequirementIntentResolvers(ctx.intentResolvers);

      // Message events: route chat vs slash_command based on commandType
      ctx.intentResolvers.register({
        id: "feishu-message",
        canResolve: (event) => event.source.pluginId === "feishu" && event.source.triggerType === "message",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: intentKindFromEvent(event),
          workspaceId: workspaceIdFromEvent(event),
          projectId: projectIdFromEvent(event),
          actor:
            event.actorHint && typeof event.actorHint.externalUserId === "string"
              ? { kind: "user", userId: event.actorHint.externalUserId }
              : { kind: "system" },
          payload: feishuPayloadFromEvent(event)
        })
      });

      // Card action events with known workbench actions → workflow_signal
      ctx.intentResolvers.register({
        id: "feishu-card-action",
        canResolve: (event) => {
          if (event.source.pluginId !== "feishu" || event.source.triggerType !== "card_action") {
            return false;
          }
          const actionType = event.external.actionType;
          return typeof actionType === "string" && WORKBENCH_ACTIONS.has(actionType);
        },
        resolve: (event) => {
          const actionType = event.external.actionType as string;
          const actionPayload = event.external.actionPayload as Record<string, unknown> ?? {};
          return {
            intentId: `intent:${event.triggerEventId}`,
            kind: "workflow_signal",
            workspaceId: workspaceIdFromEvent(event),
            projectId: projectIdFromEvent(event),
            actor:
              event.actorHint && typeof event.actorHint.externalUserId === "string"
                ? { kind: "user", userId: event.actorHint.externalUserId }
                : { kind: "system" },
            payload: {
              sourcePlugin: "feishu",
              actionType,
              ...actionPayload,
              chatId: event.external.chatId,
              messageId: event.external.messageId
            }
          };
        }
      });

      // Generic card action events → control_action (catch-all)
      ctx.intentResolvers.register({
        id: "feishu-card-action-generic",
        canResolve: (event) => event.source.pluginId === "feishu" && event.source.triggerType === "card_action",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: "control_action",
          workspaceId: workspaceIdFromEvent(event),
          projectId: projectIdFromEvent(event),
          actor:
            event.actorHint && typeof event.actorHint.externalUserId === "string"
              ? { kind: "user", userId: event.actorHint.externalUserId }
              : { kind: "system" },
          payload: {
            ...event.external,
            sourcePlugin: "feishu"
          }
        })
      });

      // Bot menu events → chat
      ctx.intentResolvers.register({
        id: "feishu-bot-menu",
        canResolve: (event) => event.source.pluginId === "feishu" && event.source.triggerType === "bot_menu",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: "chat",
          workspaceId: workspaceIdFromEvent(event),
          projectId: projectIdFromEvent(event),
          actor:
            event.actorHint && typeof event.actorHint.externalUserId === "string"
              ? { kind: "user", userId: event.actorHint.externalUserId }
              : { kind: "system" },
          payload: feishuPayloadFromEvent(event)
        })
      });

      // --- Workflow selectors ---

      ctx.workflowSelector.register({
        id: "feishu-chat",
        matches: (intent) => intent.kind === "chat" && intentPayloadSource(intent.payload) === "feishu",
        definitionId: "agent.conversation.workflow"
      });

      ctx.workflowSelector.register({
        id: "feishu-slash",
        matches: (intent) => intent.kind === "slash_command" && intentPayloadSource(intent.payload) === "feishu",
        definitionId: "feishu.slash.workflow"
      });

      ctx.workflowSelector.register({
        id: "feishu-control-action",
        matches: (intent) => intent.kind === "control_action" && intentPayloadSource(intent.payload) === "feishu",
        definitionId: "feishu.control_action.workflow"
      });

      // --- Workflow definitions ---

      ctx.workflows.register({
        definitionId: "feishu.slash.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "acknowledge",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              if (payload.shouldRespond !== false) {
                await stepCtx.executeEffect({
                  pluginId: "feishu",
                  effectType: "reply",
                  input: {
                    messageId: (payload.messageId ?? payload.chatId) as string,
                    content: `[slash command "${payload.commandType}" processed via runtime]`
                  }
                });
              }
              return { kind: "complete", output: { acknowledged: true } };
            }
          }
        ]
      });

      // Control action workflow: handles generic card_action-triggered intents.
      // Recognized actions are acknowledged; unknown actions produce a
      // runtime failure event.
      ctx.workflows.register({
        definitionId: "feishu.control_action.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "process_action",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              const actionType = payload.actionType as string;

              const knownActions = [
                "workbench_plan_approve",
                "workbench_plan_cancel",
                "workbench_plan_reject",
                "workbench_plan_push",
                "workbench_plan_cleanup",
                "workbench_plan_revise",
                "workbench_plan_revision_submit",
                "workbench_plan_base_branch_submit",
                "workbench_plan_revise_execution",
                "workbench_plan_revise_execution_submit",
                "bind_repo_submit",
                "bind_repo_cancel",
                "platform_action",
                "push_repository"
              ];

              if (knownActions.includes(actionType)) {
                return { kind: "complete", output: { actionProcessed: true, actionType } };
              }

              return {
                kind: "fail",
                error: {
                  code: "UNKNOWN_CARD_ACTION",
                  category: "validation",
                  message: `Unknown card action type: ${actionType}`,
                  retryable: false,
                  recoverable: false
                },
                recoverable: false
              };
            }
          }
        ]
      });

      // --- Client-backed effect handlers ---

      ctx.effectHandlers.register({
        pluginId: "feishu",
        effectType: "reply",
        execute: async (effect) => {
          const input = effect.input as { messageId?: string; content?: string };
          if (!input.messageId || typeof input.messageId !== "string") {
            throw new Error("Missing required field: messageId (string)");
          }
          if (!input.content || typeof input.content !== "string") {
            throw new Error("Missing required field: content (string)");
          }
          const messageId = await client.replyText(input.messageId, input.content);
          return { replied: true, messageId, originalMessageId: input.messageId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "feishu",
        effectType: "agent_conversation.render",
        execute: async (effect) => {
          const input = effect.input as {
            chatId?: string;
            messageId?: string;
            result?: AgentConversationResult;
          };
          await renderFeishuAgentConversationResult(client, {
            chatId: requiredString(input.chatId, "chatId"),
            messageId: requiredString(input.messageId, "messageId"),
            result: requiredAgentConversationResult(input.result)
          });
          return { rendered: true };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "feishu",
        effectType: "card.update",
        execute: async (effect) => {
          const input = effect.input as { messageId?: string; card?: unknown };
          if (!input.messageId || typeof input.messageId !== "string") {
            throw new Error("Missing required field: messageId (string)");
          }
          if (input.card === undefined || input.card === null) {
            throw new Error("Missing required field: card");
          }
          await client.updateInteractiveCard(input.messageId, input.card);
          return { updated: true, messageId: input.messageId };
        }
      });

      registerFeishuRequirementRenderEffects(ctx.effectHandlers, client);
    }
  };
}

function workspaceIdFromEvent(event: TriggerEvent): string {
  const workspaceId = event.external.resolvedWorkspaceId;
  if (typeof workspaceId !== "string" || workspaceId.length === 0) {
    throw new Error("resolved workspaceId missing from trigger event");
  }
  return workspaceId;
}

function projectIdFromEvent(event: TriggerEvent): string | null {
  const projectId = event.external.resolvedProjectId;
  return typeof projectId === "string" ? projectId : null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }
  return value;
}

function requiredAgentConversationResult(value: unknown): AgentConversationResult {
  if (!value || typeof value !== "object" || !("status" in value)) {
    throw new Error("Missing required field: result");
  }
  return value as AgentConversationResult;
}
