import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import type { Startable } from "../../app/feegle-app.js";

export interface RuntimePhaseDeps {
  contributions: Contributions;
  onRuntime(runtime: Startable): void;
}

export function runtimePhase(deps: RuntimePhaseDeps): BootPhase {
  return {
    name: "runtime",
    run: async (ctx: BootContext) => {
      ctx.require("runtimeStore").markRunningAttemptsInterrupted(new Date().toISOString());
      const runtimes = deps.contributions.platformRuntimes.map((module) => module.create(ctx));
      for (const runtime of runtimes) {
        await runtime.start();
      }
      const primary = runtimes[0];
      if (!primary) {
        throw new Error("no platform runtime registered");
      }
      deps.onRuntime(primary);
    }
  };
}
