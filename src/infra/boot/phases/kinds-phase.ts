import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import { buildHandlerKindRegistry } from "../../../features/scheduler/build-handler-kind-registry.js";

export function kindsPhase(deps: { contributions: Contributions }): BootPhase {
  return {
    name: "kinds",
    run: async (ctx: BootContext) => {
      ctx.provide("kinds", buildHandlerKindRegistry({ ctx, modules: deps.contributions.handlerKinds }));
    }
  };
}
