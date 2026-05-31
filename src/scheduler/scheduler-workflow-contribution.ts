import type { RuntimeContributionModule } from "../boot/feegle-plugin.js";

export function schedulerWorkflowContribution(): RuntimeContributionModule {
  return {
    id: "scheduler-runtime",
    register: (ctx) => {
      ctx.workflows.register({
        definitionId: "scheduler.heartbeat.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "heartbeat",
            run: () => ({ kind: "complete", output: { heartbeat: true } })
          }
        ]
      });

      ctx.workflows.register({
        definitionId: "scheduler.agent_prompt.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "run_prompt",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              if (payload.prompt) {
                await stepCtx.executeEffect({
                  pluginId: "core",
                  effectType: "agent_prompt",
                  input: { prompt: payload.prompt }
                });
              }
              return { kind: "complete", output: { executed: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "core",
        effectType: "agent_prompt",
        execute: (effect) => {
          return { executed: true, prompt: (effect.input as Record<string, unknown>).prompt };
        }
      });
    }
  };
}
