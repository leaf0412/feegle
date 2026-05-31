import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";

export function gitlabRuntimeContribution(): RuntimeContributionModule {
  return {
    id: "gitlab-runtime",
    register: (ctx) => {
      ctx.intentResolvers.register({
        id: "gitlab-review",
        canResolve: (event) => event.source.pluginId === "gitlab",
        resolve: (event) => ({
          intentId: `intent:${event.triggerEventId}`,
          kind: "chat",
          workspaceId: "ws_default",
          projectId: null,
          actor: { kind: "system" },
          payload: event.external
        })
      });

      ctx.workflowSelector.register({
        id: "gitlab-review",
        matches: (intent) => intent.kind === "chat",
        definitionId: "gitlab.review.workflow"
      });

      ctx.workflows.register({
        definitionId: "gitlab.review.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "review",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              if (payload.text) {
                await stepCtx.executeEffect({
                  pluginId: "gitlab",
                  effectType: "post_comment",
                  input: { body: payload.text }
                });
              }
              return { kind: "complete", output: { reviewed: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "gitlab",
        effectType: "post_comment",
        execute: (effect) => {
          return { posted: true, body: (effect.input as Record<string, unknown>).body };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "gitlab",
        effectType: "update_status",
        execute: (effect) => {
          return { updated: true, status: (effect.input as Record<string, unknown>).status };
        }
      });
    }
  };
}
