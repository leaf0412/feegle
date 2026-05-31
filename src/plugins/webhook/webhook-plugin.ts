import type { FeeglePlugin, RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

export function webhookRuntimeContribution(): RuntimeContributionModule {
  return {
    id: "webhook-runtime",
    register: (ctx) => {
      ctx.intentResolvers.register({
        id: "webhook-inbound",
        canResolve: (event) => event.source.pluginId === "webhook",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: "workflow_signal",
          workspaceId: workspaceIdFromEvent(event),
          projectId: projectIdFromEvent(event),
          actor: { kind: "system" },
          payload: event.external
        })
      });

      ctx.workflowSelector.register({
        id: "webhook-inbound",
        matches: (intent) => intent.kind === "workflow_signal",
        definitionId: "webhook.inbound.workflow"
      });

      ctx.workflows.register({
        definitionId: "webhook.inbound.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "record",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              await stepCtx.executeEffect({
                pluginId: "webhook",
                effectType: "record_event",
                input: { payload }
              });
              return { kind: "complete", output: { recorded: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "webhook",
        effectType: "record_event",
        execute: (effect) => {
          return { recorded: true, input: (effect.input as Record<string, unknown>).payload };
        }
      });
    }
  };
}

export const webhookPlugin: FeeglePlugin = {
  id: "webhook",
  manifest: {
    id: "webhook",
    version: "1.0.0",
    displayName: "Webhook Ingress",
    description: "Receives external webhook triggers and records events",
    triggerTypes: ["webhook"],
    effectTypes: [{ pluginId: "webhook", effectType: "record_event" }],
    intentKinds: ["workflow_signal"],
    permissions: ["receive_webhooks"]
  },
  runtimeContributions: [webhookRuntimeContribution()]
};

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
