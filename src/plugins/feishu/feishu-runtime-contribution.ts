import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

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

      // Resolve card action events (approve, reject, cancel, revise, etc.)
      // as control_action intents, routing them through the runtime pipeline.
      ctx.intentResolvers.register({
        id: "feishu-card-action",
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
          payload: event.external
        })
      });

      // Resolve bot menu events (text commands from the bot menu) as chat
      // intents so they flow through the same pipeline as text messages.
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
          payload: event.external
        })
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

      // Control action workflow: handles card_action-triggered intents.
      // Recognized actions are acknowledged; unknown actions produce a
      // runtime failure event.
      ctx.workflowSelector.register({
        id: "feishu-control-action",
        matches: (intent) => intent.kind === "control_action",
        definitionId: "feishu.control_action.workflow"
      });

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
