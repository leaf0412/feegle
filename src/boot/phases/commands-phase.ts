import type { BootContext } from "../boot-context.js";
import type { BootPhase } from "../boot-phase.js";
import type { Contributions } from "../feegle-plugin.js";
import { EmptyProviderStoreReadView } from "../resolve-agents.js";
import { buildSlashCommandRegistry } from "../../platform/build-slash-command-registry.js";
import { InMemoryRepositoryRegistry } from "../../repositories/repository-registry.js";
import type { TaskScheduler } from "../../scheduler/task-scheduler.js";

export interface CommandsPhaseDeps {
  feegleHome: string;
  ownerEmails: ReadonlySet<string>;
  contributions: Contributions;
}

export function commandsPhase(deps: CommandsPhaseDeps): BootPhase {
  return {
    name: "commands",
    run: async (ctx: BootContext) => {
      const repositories = new InMemoryRepositoryRegistry();
      ctx.provide("repositories", repositories);
      const cap = ctx.pick(
        "userDirectory",
        "repositoryStore",
        "chatBindingStore",
        "taskRegistry",
        "configStore",
        "stockStore",
        "quote",
        "kinds",
        "scheduler",
        "runsLog",
        "agents",
        "sessionStore",
        "chatHistory",
        "aliasStore"
      );
      const registry = buildSlashCommandRegistry({
        feegleHome: deps.feegleHome,
        userDirectory: cap.userDirectory,
        repositories,
        repositoryStore: cap.repositoryStore,
        chatBindingStore: cap.chatBindingStore,
        ownerEmails: deps.ownerEmails,
        taskRegistry: cap.taskRegistry,
        configStore: cap.configStore,
        stockStore: cap.stockStore,
        quote: cap.quote,
        kinds: cap.kinds,
        scheduler: cap.scheduler as TaskScheduler,
        runsLog: cap.runsLog,
        providers: cap.agents,
        providerStore: new EmptyProviderStoreReadView(),
        sessionStore: cap.sessionStore,
        chatHistory: cap.chatHistory,
        aliasStore: cap.aliasStore,
        modules: deps.contributions.slashCommands,
        defaults: false
      });
      ctx.provide("slashCommands", registry);
    }
  };
}
