import { join } from "node:path";
import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import { ConfigStore, type ConfigStorePort } from "../../app/config-store.js";
import { acquireFeegleLock } from "../../app/feegle-lock.js";
import { openRuntimeDb } from "../../app/runtime-db.js";
import { ChatWorkspaceStore } from "../../workbench/chat-workspace-store.js";
import { PendingInteractionStore } from "../../workbench/pending-interaction-store.js";
import { PlanArtifactStore } from "../../workbench/plan-artifact-store.js";

export interface InfraPhaseDeps {
  feegleHome: string;
  acquireLock?: (feegleHome: string) => Promise<() => Promise<void>>;
  loadConfigStore?: (feegleHome: string) => Promise<ConfigStorePort>;
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
      ctx.provide("chatWorkspaceStore", new ChatWorkspaceStore(runtimeDb));
      ctx.provide("pendingInteractionStore", new PendingInteractionStore(runtimeDb));
      ctx.provide("planArtifactStore", new PlanArtifactStore(runtimeDb));
    }
  };
}
