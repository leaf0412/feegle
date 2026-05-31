import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { IntentKind } from "@core/ingress/intent.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

function intentKindFromEvent(event: TriggerEvent): IntentKind {
  const commandType = event.external.commandType;
  if (typeof commandType === "string" && commandType === "chat") {
    return "chat";
  }
  return "slash_command";
}

export function feishuRuntimeContribution(): RuntimeContributionModule {
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
              const payload = stepCtx.input as Record<string, unknown>;
              if (payload.shouldRespond !== false) {
                await stepCtx.executeEffect({
                  pluginId: "feishu",
                  effectType: "reply",
                  input: {
                    chatId: payload.chatId,
                    content: "[chat processed via runtime]"
                  }
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
                    chatId: payload.chatId,
                    content: `[slash command "${payload.commandType}" processed via runtime]`
                  }
                });
              }
              return { kind: "complete", output: { acknowledged: true } };
            }
          }
        ]
      });

      // Register Feishu effect handlers
      ctx.effectHandlers.register({
        pluginId: "feishu",
        effectType: "reply",
        execute: (effect) => {
          return { replied: true, chatId: (effect.input as Record<string, unknown>).chatId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "feishu",
        effectType: "card.update",
        execute: (effect) => {
          return { updated: true, cardId: (effect.input as Record<string, unknown>).cardId };
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
