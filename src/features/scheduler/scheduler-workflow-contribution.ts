import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";

export function schedulerWorkflowContribution(): RuntimeContributionModule {
  return {
    id: "scheduler-runtime",
    register: (ctx) => {
      // ── Heartbeat ──
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

      // ── Agent prompt ──
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

      // ── Stock monitor ──
      ctx.workflows.register({
        definitionId: "scheduler.stock_monitor.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "monitor",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              await stepCtx.executeEffect({
                pluginId: "core",
                effectType: "stock_monitor",
                input: {
                  stocks: payload.stocks,
                  tolerancePrice: payload.tolerancePrice
                }
              });
              return { kind: "complete", output: { monitored: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "core",
        effectType: "stock_monitor",
        execute: (effect) => {
          return { monitored: true, stocks: (effect.input as Record<string, unknown>).stocks };
        }
      });

      // ── Stock portfolio snapshot ──
      ctx.workflows.register({
        definitionId: "scheduler.stock_portfolio_snapshot.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "snapshot",
            run: async (stepCtx) => {
              await stepCtx.executeEffect({
                pluginId: "core",
                effectType: "stock_portfolio_snapshot",
                input: {}
              });
              return { kind: "complete", output: { snapshotted: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "core",
        effectType: "stock_portfolio_snapshot",
        execute: () => {
          return { snapshotted: true };
        }
      });

      // ── Stock advisor ──
      ctx.workflows.register({
        definitionId: "scheduler.stock_advisor.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "advise",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              await stepCtx.executeEffect({
                pluginId: "core",
                effectType: "stock_advisor",
                input: {
                  provider: payload.provider,
                  promptTemplate: payload.promptTemplate,
                  occasion: payload.occasion
                }
              });
              return { kind: "complete", output: { advised: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "core",
        effectType: "stock_advisor",
        execute: (effect) => {
          return { advised: true, provider: (effect.input as Record<string, unknown>).provider };
        }
      });

      // ── GitLab follow ──
      ctx.workflows.register({
        definitionId: "scheduler.gitlab_follow.workflow",
        version: 1,
        concurrencyPolicy: "skip_if_running",
        steps: [
          {
            stepId: "follow",
            run: async (stepCtx) => {
              const payload = stepCtx.input as Record<string, unknown>;
              await stepCtx.executeEffect({
                pluginId: "core",
                effectType: "gitlab_follow",
                input: {
                  botUsername: payload.botUsername
                }
              });
              return { kind: "complete", output: { followed: true } };
            }
          }
        ]
      });

      ctx.effectHandlers.register({
        pluginId: "core",
        effectType: "gitlab_follow",
        execute: () => {
          return { followed: true };
        }
      });
    }
  };
}
