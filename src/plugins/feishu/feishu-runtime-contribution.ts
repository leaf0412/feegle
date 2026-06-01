import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { AgentConversationResult } from "@core/agent-conversation/agent-conversation-models.js";
import type { IntentKind } from "@core/ingress/intent.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { WorkbenchCardService } from "@features/workbench/workbench-card-service.js";
import { renderFeishuCard } from "@integrations/feishu/feishu-card-renderer.js";
import { renderFeishuAgentConversationResult } from "./feishu-agent-conversation-renderer.js";
import { registerFeishuRequirementIntentResolvers } from "./feishu-requirement-intent-resolver.js";
import { registerFeishuRequirementRenderEffects } from "./feishu-requirement-renderer.js";
import {
  registerWorkbenchIntentResolver,
  registerWorkbenchCardWorkflowSelector,
  workbenchCardWorkflowId
} from "@features/workbench/workbench-intent-resolver.js";

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

export function feishuRuntimeContribution(
  client: FeishuClientPort,
  cloudDoc: FeishuCloudDocClientPort,
  getWorkbenchCardService?: () => WorkbenchCardService
): RuntimeContributionModule {
  return {
    id: "feishu-runtime",
    register: (ctx) => {
      // --- Intent resolvers ---

      // Workbench card: claims chat messages before feishu-message so idle chat
      // is replaced by the workbench card flow.
      registerWorkbenchIntentResolver(ctx.intentResolvers);
      registerWorkbenchCardWorkflowSelector(ctx.workflowSelector);

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

      // Workbench card workflow: renders the workbench card for chat messages
      // OR processes a button click (workbench_action intent) and updates the card.
      ctx.workflows.register({
        definitionId: workbenchCardWorkflowId,
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "render_workbench",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              const chatId = payload.chatId as string;
              const messageId = payload.messageId as string;
              const button = payload.button as string | undefined;
              const actionPayload = payload.payload as string | undefined;
              const card = await stepCtx.executeEffect({
                pluginId: "feishu",
                effectType: "workbench.render",
                input: { chatId, messageId, button, payload: actionPayload }
              });
              return { kind: "complete", output: card };
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

      registerFeishuRequirementRenderEffects(ctx.effectHandlers, client, cloudDoc);

      // Workbench render/update effect: get card from WorkbenchCardService and
      // send it via replyInteractiveCard (new card) or updateInteractiveCard (in place).
      ctx.effectHandlers.register({
        pluginId: "feishu",
        effectType: "workbench.render",
        execute: async (effect) => {
          const input = effect.input as {
            chatId?: string;
            messageId?: string;
            button?: string;
            payload?: string;
          };
          const chatId = typeof input.chatId === "string" ? input.chatId : null;
          const messageId = typeof input.messageId === "string" ? input.messageId : null;
          if (!chatId || !messageId) {
            throw new Error("feishu.workbench.render requires chatId and messageId");
          }
          if (!getWorkbenchCardService) {
            throw new Error("feishu.workbench.render: WorkbenchCardService not available");
          }
          const service = getWorkbenchCardService();
          const button = typeof input.button === "string" ? input.button : null;
          const payload = typeof input.payload === "string" ? input.payload : undefined;
          const card = button
            ? await service.handleAction(chatId, button as import("@features/workbench/workbench-models.js").WorkbenchButton, payload)
            : await service.getCard(chatId);
          const rendered = renderFeishuCard(card);
          if (button) {
            // Update existing card in place (user clicked a button on this card).
            await client.updateInteractiveCard(messageId, rendered);
          } else {
            // Reply with a new card (chat message triggered this render).
            await client.replyInteractiveCard(messageId, rendered);
          }
          return { rendered: true, chatId, action: button ? "updated" : "replied" };
        }
      });
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
