import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

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

export function feishuRuntimeContribution(): RuntimeContributionModule {
  return {
    id: "feishu-runtime",
    register: (ctx) => {
      ctx.intentResolvers.register({
        id: "feishu-message",
        canResolve: (event) => event.source.pluginId === "feishu" && event.source.triggerType === "message",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: "chat",
          workspaceId: workspaceIdFromEvent(event),
          projectId: projectIdFromEvent(event),
          actor:
            event.actorHint && typeof event.actorHint.externalUserId === "string"
              ? { kind: "user", userId: event.actorHint.externalUserId }
              : { kind: "system" },
          payload: event.external
        })
      });

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
              actionType,
              ...actionPayload,
              chatId: event.external.chatId,
              messageId: event.external.messageId
            }
          };
        }
      });

      ctx.workflowSelector.register({
        id: "feishu-chat",
        matches: (intent) => intent.kind === "chat",
        definitionId: "feishu.chat.workflow"
      });

      ctx.workflows.register({
        definitionId: "feishu.chat.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "reply",
            run: async (stepCtx) => {
              const payload = stepCtx.input as { chatId?: string; text?: string };
              if (payload.chatId && payload.text) {
                await stepCtx.executeEffect({
                  pluginId: "feishu",
                  effectType: "reply",
                  input: { chatId: payload.chatId, content: payload.text }
                });
              }
              return { kind: "complete", output: { replied: true } };
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
