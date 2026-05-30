import type { BootPhase } from "./boot-phase.js";
import type { Contributions } from "./feegle-plugin.js";
import { makeResolveAgents } from "./resolve-agents.js";
import { infraPhase } from "./phases/infra-phase.js";
import { storesPhase } from "./phases/stores-phase.js";
import { providersPhase } from "./phases/providers-phase.js";
import { kindsPhase } from "./phases/kinds-phase.js";
import { schedulerPhase } from "./phases/scheduler-phase.js";
import { commandsPhase } from "./phases/commands-phase.js";
import { runtimeContributionsPhase } from "./phases/runtime-contributions-phase.js";
import { runtimePhase } from "./phases/runtime-phase.js";
import type { FeegleAppDeps, Startable } from "../app/feegle-app.js";
import type { Task } from "../scheduler/task.js";

export interface BuildBootPhasesDeps {
  appDeps: FeegleAppDeps;
  contributions: Contributions;
  quoteClientId: string;
  seedTasks: Task[];
  onLockRelease(release: () => Promise<void>): void;
  onScheduler(scheduler: Startable): void;
  onRuntime(runtime: Startable): void;
}

export function buildBootPhases(deps: BuildBootPhasesDeps): BootPhase[] {
  const { appDeps } = deps;
  return [
    infraPhase({
      feegleHome: appDeps.feegleHome,
      acquireLock: appDeps.acquireLock,
      loadConfigStore: appDeps.loadConfigStore,
      onLockRelease: deps.onLockRelease
    }),
    storesPhase({ feegleHome: appDeps.feegleHome, seedTasks: deps.seedTasks }),
    providersPhase({
      feishuClient: appDeps.feishuClient,
      quoteClientId: deps.quoteClientId,
      contributions: deps.contributions,
      resolveAgents: makeResolveAgents({
        feegleHome: appDeps.feegleHome,
        agentProviders: appDeps.agentProviders,
        loadAgentProviders: appDeps.loadAgentProviders
      })
    }),
    kindsPhase({ contributions: deps.contributions }),
    schedulerPhase({
      ownerEmails: appDeps.ownerEmails,
      hooks: appDeps.hooks,
      createScheduler: appDeps.createScheduler,
      onScheduler: deps.onScheduler
    }),
    commandsPhase({
      feegleHome: appDeps.feegleHome,
      ownerEmails: appDeps.ownerEmails,
      contributions: deps.contributions
    }),
    runtimeContributionsPhase({ contributions: deps.contributions }),
    runtimePhase({ contributions: deps.contributions, onRuntime: deps.onRuntime })
  ];
}
