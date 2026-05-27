import type { FeishuUserDirectory } from "../feishu/feishu-user-directory.js";
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "../agent/chat-history-store.js";
import type { ProviderStorePort } from "../agent/provider-store.js";
import type { SessionStore } from "../agent/session-store.js";
import type { ChatBindingStore } from "../repositories/chat-binding-store.js";
import type { RepositoryStore } from "../repositories/repository-store.js";
import type { AliasStore } from "./commands/alias-store.js";
import type { SchedulerCommandDeps } from "./commands/scheduler-command-deps.js";
import type { RepositoryListSource } from "./commands/repo-list-command.js";
import type { SlashCommandRegistry } from "./slash-command-handler.js";
import type { PipelineHooks } from "./pipeline-hooks.js";

export interface SlashCommandRegistryDeps {
  repositories: RepositoryListSource;
  repositoryStore?: RepositoryStore;
  chatBindingStore?: ChatBindingStore;
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
  providerStore?: ProviderStorePort;
  sessionStore?: SessionStore;
  chatHistory?: ChatHistoryStore;
  aliasStore?: AliasStore;
  pipelineHooks?: PipelineHooks;
}

export interface SlashCommandModule {
  readonly id: string;
  register(registry: SlashCommandRegistry, deps: SlashCommandRegistryDeps): void;
}
