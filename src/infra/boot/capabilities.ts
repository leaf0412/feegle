import type { AgentConversationRunner } from "@core/agent-conversation/agent-conversation-service.js";
import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "@integrations/agent/chat-history-store.js";
import type { ProviderStorePort } from "@integrations/agent/provider-store.js";
import type { SessionStore } from "@integrations/agent/session-store.js";
import type { ConfigStoreProviderWriter } from "../app/config-store.js";
import type { NotificationBroker } from "../app/notification-broker.js";
import type { RuntimeDb } from "../app/runtime-db.js";
import type { ArtifactService } from "@core/artifacts/artifact-service.js";
import type { ArtifactStore } from "@core/artifacts/artifact-store.js";
import type { ControlActionProcessor } from "@core/control/control-action-processor.js";
import type { ControlActionStore } from "@core/control/control-action-store.js";
import type { MemoryService } from "@core/memory/memory-service.js";
import type { RuntimeInspectionService } from "@core/operations/runtime-inspection-service.js";
import type { RecoveryService } from "@core/recovery/recovery-service.js";
import type { GitService } from "../git/git-service.js";
import type { GitLabClient } from "@integrations/gitlab/gitlab-client.js";
import type { GitLabFollowStore } from "@integrations/gitlab/gitlab-follow-store.js";
import type { FeishuUserDirectory } from "@integrations/feishu/feishu-user-directory.js";
import type { IdentityResolverPort } from "@core/ingress/identity-resolver.js";
import type { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import type { PermissionPolicyPort } from "@core/ingress/permission-policy.js";
import type { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import type { WorkspaceResolverPort } from "@core/ingress/workspace-resolver.js";
import type { PermissionService } from "@core/security/permission-service.js";
import type { PolicyService } from "@core/security/policy-service.js";
import type { MemoryStore } from "@core/memory/memory-store.js";
import type { AliasStore } from "@platform/commands/alias-store.js";
import type { SlashCommandRegistry } from "@platform/slash-command-handler.js";
import type { ChatBindingStore } from "@resources/repositories/chat-binding-store.js";
import type { InMemoryRepositoryRegistry } from "@resources/repositories/repository-registry.js";
import type { RepositoryStore } from "@resources/repositories/repository-store.js";
import type { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import type { RuntimeEffectExecutor } from "@core/runtime/runtime-effect-executor.js";
import type { RuntimeStore } from "@core/runtime/runtime-store.js";
import type { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import type { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";
import type { DedupStore } from "@features/scheduler/dedup-store.js";
import type { HandlerKindRegistry } from "@features/scheduler/handler-kind-registry.js";
import type { RunsLog } from "@features/scheduler/runs-log.js";
import type { TaskRegistry } from "@features/scheduler/task-registry.js";
import type { TaskScheduler } from "@features/scheduler/task-scheduler.js";
import type { TaskStore } from "@features/scheduler/task-store.js";
import type { QuoteClient } from "@integrations/stock/stock-quote-port.js";
import type { StockStore } from "@integrations/stock/stock-store.js";
import type { PlanArtifactStore } from "@features/workbench/plan-artifact-store.js";
import type { IngressDispatcher } from "@core/ingress/ingress-dispatcher.js";
import type { RequirementWorkflowStore } from "@plugins/requirement-workflow/requirement-workflow-store.js";
import type { WorkbenchCardService } from "@features/workbench/workbench-card-service.js";

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
  agentConversationService: AgentConversationRunner;
  runtimeStore: RuntimeStore;
  workflowRegistry: WorkflowRegistry;
  workflowRuntime: WorkflowRuntime;
  intentResolvers: IntentResolverRegistry;
  workflowSelector: WorkflowSelector;
  identityResolver: IdentityResolverPort;
  workspaceResolver: WorkspaceResolverPort;
  permissionPolicy: PermissionPolicyPort;
  effectHandlers: EffectHandlerRegistry;
  effectExecutor: RuntimeEffectExecutor;
  runtimeInspectionService: RuntimeInspectionService;
  recoveryService: RecoveryService;
  artifactStore: ArtifactStore;
  artifactService: ArtifactService;
  permissionService: PermissionService;
  policyService: PolicyService;
  memoryStore: MemoryStore;
  memoryService: MemoryService;
  controlActionStore: ControlActionStore;
  controlActionProcessor: ControlActionProcessor;
  runtimeIngress: IngressDispatcher;
  requirementWorkflowStore: RequirementWorkflowStore;
  // providers
  agents: AgentProviderRegistry;
  gitlab: GitLabClient;
  gitlabFollowStore: GitLabFollowStore;
  gitService: GitService;
  notify: NotificationBroker;
  quote: QuoteClient;
  workbenchCardService: WorkbenchCardService;
  // kinds / scheduler
  kinds: HandlerKindRegistry;
  scheduler: TaskScheduler;
  // commands (userDirectory provided by the Feishu plugin)
  repositories: InMemoryRepositoryRegistry;
  userDirectory: FeishuUserDirectory;
  slashCommands: SlashCommandRegistry;
}
