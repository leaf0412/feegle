import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "../agent/chat-history-store.js";
import type { ProviderStorePort } from "../agent/provider-store.js";
import type { SessionStore } from "../agent/session-store.js";
import type { ConfigStoreProviderWriter } from "../app/config-store.js";
import type { NotificationBroker } from "../app/notification-broker.js";
import type { RuntimeDb } from "../app/runtime-db.js";
import type { GitService } from "../git/git-service.js";
import type { GitLabClient } from "../gitlab/gitlab-client.js";
import type { GitLabFollowStore } from "../gitlab/gitlab-follow-store.js";
import type { FeishuUserDirectory } from "../feishu/feishu-user-directory.js";
import type { AliasStore } from "../platform/commands/alias-store.js";
import type { SlashCommandRegistry } from "../platform/slash-command-handler.js";
import type { ChatBindingStore } from "../repositories/chat-binding-store.js";
import type { InMemoryRepositoryRegistry } from "../repositories/repository-registry.js";
import type { RepositoryStore } from "../repositories/repository-store.js";
import type { DedupStore } from "../scheduler/dedup-store.js";
import type { HandlerKindRegistry } from "../scheduler/handler-kind-registry.js";
import type { RunsLog } from "../scheduler/runs-log.js";
import type { TaskRegistry } from "../scheduler/task-registry.js";
import type { TaskScheduler } from "../scheduler/task-scheduler.js";
import type { TaskStore } from "../scheduler/task-store.js";
import type { QuoteClient } from "../stock/stock-quote-port.js";
import type { StockStore } from "../stock/stock-store.js";
import type { PlanArtifactStore } from "../workbench/plan-artifact-store.js";

/**
 * The catalog of every capability the host can provide during boot. Grows only
 * when a genuinely new service is introduced — a rare, core-level change.
 *
 * `keyof Capabilities` keeps `BootContext` access fully typed: a mistyped key is
 * a compile error and `pick` returns the correct value types.
 */
export interface Capabilities {
  // infra
  configStore: ConfigStoreProviderWriter;
  runtimeDb: RuntimeDb;
  planArtifactStore: PlanArtifactStore;
  // stores
  sessionStore: SessionStore;
  chatHistory: ChatHistoryStore;
  aliasStore: AliasStore;
  repositoryStore: RepositoryStore;
  chatBindingStore: ChatBindingStore;
  stockStore: StockStore;
  dedupStore: DedupStore;
  runsLog: RunsLog;
  taskStore: TaskStore;
  taskRegistry: TaskRegistry;
  providerStore: ProviderStorePort;
  // providers
  agents: AgentProviderRegistry;
  gitlab: GitLabClient;
  gitlabFollowStore: GitLabFollowStore;
  gitService: GitService;
  notify: NotificationBroker;
  quote: QuoteClient;
  // kinds / scheduler
  kinds: HandlerKindRegistry;
  scheduler: TaskScheduler;
  // commands (userDirectory provided by the Feishu plugin)
  repositories: InMemoryRepositoryRegistry;
  userDirectory: FeishuUserDirectory;
  slashCommands: SlashCommandRegistry;
}
