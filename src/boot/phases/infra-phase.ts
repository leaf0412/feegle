import { join } from "node:path";
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { ConfigStore, type ConfigStoreProviderWriter } from "../../app/config-store.js";
import { acquireFeegleLock } from "../../app/feegle-lock.js";
import { openRuntimeDb } from "../../app/runtime-db.js";
import { PlanArtifactStore } from "../../workbench/plan-artifact-store.js";

export interface InfraPhaseDeps {
  feegleHome: string;
  acquireLock?: (feegleHome: string) => Promise<() => Promise<void>>;
  loadConfigStore?: (feegleHome: string) => Promise<ConfigStoreProviderWriter>;
  onLockRelease(release: () => Promise<void>): void;
}

export function infraPhase(deps: InfraPhaseDeps): BootPhase {
  return {
    name: "infra",
    run: async (ctx: BootContext) => {
      deps.onLockRelease(await (deps.acquireLock ?? acquireFeegleLock)(deps.feegleHome));
      ctx.provide("configStore", await (deps.loadConfigStore ?? ConfigStore.load)(deps.feegleHome));
      const runtimeDb = openRuntimeDb(join(deps.feegleHome, "feegle.db"));
      ctx.provide("runtimeDb", runtimeDb);
      ctx.provide("planArtifactStore", new PlanArtifactStore(runtimeDb));
    }
  };
}
