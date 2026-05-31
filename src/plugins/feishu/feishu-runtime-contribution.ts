import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { IntentKind } from "@core/ingress/intent.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";

function intentKindFromEvent(event: TriggerEvent): IntentKind {
  const commandType = event.external.commandType;
  if (typeof commandType === "string" && commandType === "chat") {
    return "chat";
  }
  return "slash_command";
}

export function feishuRuntimeContribution(client: FeishuClientPort): RuntimeContributionModule {
  return {
    id: "feishu-runtime",
    register: (ctx) => {
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
          payload: event.external
        })
      });

      ctx.workflowSelector.register({
        id: "feishu-chat",
        matches: (intent) => intent.kind === "chat",
        definitionId: "feishu.chat.workflow"
      });

      ctx.workflowSelector.register({
        id: "feishu-slash",
        matches: (intent) => intent.kind === "slash_command",
        definitionId: "feishu.slash.workflow"
      });

      ctx.workflows.register({
        definitionId: "feishu.chat.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "reply",
            run: async (stepCtx) => {
              const payload = stepCtx.input as { chatId?: string; messageId?: string; text?: string; shouldRespond?: boolean };
              if (payload.shouldRespond !== false && payload.messageId && payload.text) {
                await stepCtx.executeEffect({
                  pluginId: "feishu",
                  effectType: "reply",
                  input: { messageId: payload.messageId, content: payload.text }
                });
              }
              return { kind: "complete", output: { replied: true } };
            }
          }
        ]
      });

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

      // Register Feishu effect handlers (client-backed)
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
