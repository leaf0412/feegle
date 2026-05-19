import type { FeishuUserDirectory } from "../feishu/feishu-user-directory.js";
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "../agent/chat-history-store.js";
import type { ProviderStore } from "../agent/provider-store.js";
import type { SessionStore } from "../agent/session-store.js";
import type { AliasStore } from "./commands/alias-store.js";
import type { SchedulerCommandDeps } from "./commands/scheduler-command-deps.js";
import type { RepositoryListSource } from "./commands/repo-list-command.js";
import type { SlashCommandRegistry } from "./slash-command-handler.js";

export interface SlashCommandRegistryDeps {
  repositories: RepositoryListSource;
  feegleHome?: string;
  ownerEmails?: SchedulerCommandDeps["ownerEmails"];
  userDirectory?: FeishuUserDirectory;
  taskRegistry?: SchedulerCommandDeps["taskRegistry"];
  configStore?: SchedulerCommandDeps["configStore"];
  stockStore?: SchedulerCommandDeps["stockStore"];
  quote?: SchedulerCommandDeps["quote"];
  kinds?: SchedulerCommandDeps["kinds"];
  scheduler?: SchedulerCommandDeps["scheduler"];
  runsLog?: SchedulerCommandDeps["runsLog"];
  providers?: AgentProviderRegistry;
  providerStore?: ProviderStore;
  sessionStore?: SessionStore;
  chatHistory?: ChatHistoryStore;
  aliasStore?: AliasStore;
}

export interface SlashCommandModule {
  readonly id: string;
  register(registry: SlashCommandRegistry, deps: SlashCommandRegistryDeps): void;
}
