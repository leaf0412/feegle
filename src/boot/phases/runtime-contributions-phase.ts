import { RuntimeContributionContext } from "../../core/runtime/runtime-contribution-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";

export interface RuntimeContributionsPhaseDeps {
  contributions: Contributions;
}

export function runtimeContributionsPhase(deps: RuntimeContributionsPhaseDeps): BootPhase {
  return {
    name: "runtime-contributions",
    run: async (ctx) => {
      const runtimeCtx = new RuntimeContributionContext({
        workflows: ctx.require("workflowRegistry"),
        intentResolvers: ctx.require("intentResolvers"),
        workflowSelector: ctx.require("workflowSelector"),
        effectHandlers: ctx.require("effectHandlers")
      });

      for (const module of deps.contributions.runtimeContributions) {
        await module.register(runtimeCtx);
      }
    }
  };
}
