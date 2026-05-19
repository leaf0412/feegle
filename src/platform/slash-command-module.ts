import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { ProviderStore } from "../agent/provider-store.js";
import type { SchedulerCommandDeps } from "./commands/scheduler-command-deps.js";
import type { RepositoryListSource } from "./commands/repo-list-command.js";
import type { SlashCommandRegistry } from "./slash-command-handler.js";

export interface SlashCommandRegistryDeps {
  repositories: RepositoryListSource;
  ownerIdentities?: SchedulerCommandDeps["ownerIdentities"];
  taskRegistry?: SchedulerCommandDeps["taskRegistry"];
  configStore?: SchedulerCommandDeps["configStore"];
  stockStore?: SchedulerCommandDeps["stockStore"];
  quote?: SchedulerCommandDeps["quote"];
  kinds?: SchedulerCommandDeps["kinds"];
  scheduler?: SchedulerCommandDeps["scheduler"];
  runsLog?: SchedulerCommandDeps["runsLog"];
  providers?: AgentProviderRegistry;
  providerStore?: ProviderStore;
}

export interface SlashCommandModule {
  readonly id: string;
  register(registry: SlashCommandRegistry, deps: SlashCommandRegistryDeps): void;
}
