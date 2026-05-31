import type { FeishuUserDirectory } from "@integrations/feishu/feishu-user-directory.js";
import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "@integrations/agent/chat-history-store.js";
import type { ProviderStorePort } from "@integrations/agent/provider-store.js";
import type { SessionStore } from "@integrations/agent/session-store.js";
import type { ControlActionProcessor } from "@core/control/control-action-processor.js";
import type { MemoryService } from "@core/memory/memory-service.js";
import type { ChatBindingStore } from "@resources/repositories/chat-binding-store.js";
import type { RepositoryStore } from "@resources/repositories/repository-store.js";
import type { AliasStore } from "./commands/alias-store.js";
import type { SchedulerCommandDeps } from "./commands/scheduler-command-deps.js";
import type { RepositoryListSource } from "./commands/repo-list-command.js";
import type { SlashCommandRegistry } from "./slash-command-handler.js";
import type { PipelineHooks } from "./pipeline-hooks.js";
import type { WorkflowRuntime } from "@core/runtime/workflow-runtime.js";
import type { RuntimeInspectionService } from "@core/operations/runtime-inspection-service.js";
import type { RecoveryService } from "@core/recovery/recovery-service.js";
import type { ControlActionStore } from "@core/control/control-action-store.js";

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
  controlActionProcessor?: ControlActionProcessor;
  workflowRuntime?: WorkflowRuntime;
  memoryService?: MemoryService;
  runtimeInspectionService?: RuntimeInspectionService;
  recoveryService?: RecoveryService;
  controlActionStore?: ControlActionStore;
}

export interface SlashCommandModule {
  readonly id: string;
  register(registry: SlashCommandRegistry, deps: SlashCommandRegistryDeps): void;
}
