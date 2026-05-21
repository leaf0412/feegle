import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import { join } from "node:path";
import { buildAgentProviderRegistry } from "../agent/build-agent-provider-registry.js";
import { ChatHistoryStore } from "../agent/chat-history-store.js";
import { ProviderStore } from "../agent/provider-store.js";
import { SessionStore } from "../agent/session-store.js";
import { FeishuChatHandler } from "../feishu/feishu-chat-handler.js";
import { FeishuUserDirectory } from "../feishu/feishu-user-directory.js";
import { FeishuCommandResponder, logFeishuCommandTrace } from "../feishu/feishu-command-responder.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import type { FeishuCommandHandler } from "../feishu/feishu-long-connection-runtime.js";
import { buildSlashCommandRegistry } from "../platform/build-slash-command-registry.js";
import { AliasStore } from "../platform/commands/alias-store.js";
import type { SlashCommandModule } from "../platform/slash-command-module.js";
import { ChatBindingStore } from "../repositories/chat-binding-store.js";
import { InMemoryRepositoryRegistry } from "../repositories/repository-registry.js";
import { RepositoryStore } from "../repositories/repository-store.js";
import { WorkspaceStore } from "../repositories/workspace-store.js";
import { buildHandlerKindRegistry } from "../scheduler/build-handler-kind-registry.js";
import { DedupStore } from "../scheduler/dedup-store.js";
import type { HandlerKindModule } from "../scheduler/handler-kind-module.js";
import { ConsoleJsonLogger } from "../scheduler/logger.js";
import { RunsLog } from "../scheduler/runs-log.js";
import { TaskRegistry } from "../scheduler/task-registry.js";
import { TaskScheduler } from "../scheduler/task-scheduler.js";
import { TaskStore } from "../scheduler/task-store.js";
import type { Task } from "../scheduler/task.js";
import { RuntimeHostInfoProvider } from "../scheduler/util/host-info.js";
import { buildQuoteClientRegistry } from "../stock/build-quote-client-registry.js";
import { defaultQuoteClientId } from "../stock/default-quote-client-modules.js";
import type { QuoteClientModule } from "../stock/quote-client-module.js";
import { StockStore } from "../stock/stock-store.js";
import { buildNotificationBroker } from "./build-notification-broker.js";
import { ConfigStore, type ConfigStorePort } from "./config-store.js";
import { acquireFeegleLock } from "./feegle-lock.js";
import { HookManager } from "./hooks.js";
import { NotificationBroker } from "./notification-broker.js";
import type { NotificationAdapterModule } from "./notification-adapter-module.js";
import { openRuntimeDb, type RuntimeDb } from "./runtime-db.js";
import { ChatWorkspaceStore } from "../workbench/chat-workspace-store.js";
import { PendingInteractionStore } from "../workbench/pending-interaction-store.js";
import { DirectorySetupService } from "../workbench/directory-setup-service.js";
import { PlanArtifactStore } from "../workbench/plan-artifact-store.js";
import { PlanArtifactService } from "../workbench/plan-artifact-service.js";
import { buildPlanRevisionRequestCard } from "../feishu/feishu-workbench-cards.js";

export interface Startable {
  start(): Promise<void>;
  stop?(): Promise<void>;
}

export interface FeegleAppDeps {
  feegleHome: string;
  ownerEmails: ReadonlySet<string>;
  feishuClient: FeishuClientPort;
  agentProviders?: AgentProviderRegistry;
  loadAgentProviders?: (feegleHome: string) => Promise<AgentProviderRegistry>;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
  acquireLock?: (feegleHome: string) => Promise<() => Promise<void>>;
  loadConfigStore?: (feegleHome: string) => Promise<ConfigStorePort>;
  createScheduler?: (deps: { notify: NotificationBroker; configStore: ConfigStorePort; hooks?: HookManager }) => Startable;
  slashCommandModules?: readonly SlashCommandModule[];
  handlerKindModules?: readonly HandlerKindModule[];
  quoteClientModules?: readonly QuoteClientModule[];
  quoteClientId?: string;
  notificationAdapterModules?: readonly NotificationAdapterModule[];
  hooks?: HookManager;
}

export class FeegleApp {
  private lockfileRelease?: () => Promise<void>;
  private scheduler?: Startable;
  private runtime?: Startable;
  private hooks?: HookManager;
  private runtimeDb?: RuntimeDb;

  constructor(private readonly deps: FeegleAppDeps) {
    this.hooks = deps.hooks;
  }

  async start(): Promise<void> {
    this.lockfileRelease = await (this.deps.acquireLock ?? acquireFeegleLock)(this.deps.feegleHome);
    const configStore = await (this.deps.loadConfigStore ?? ConfigStore.load)(this.deps.feegleHome);
    this.runtimeDb = openRuntimeDb(join(this.deps.feegleHome, "feegle.db"));
    const chatWorkspaceStore = new ChatWorkspaceStore(this.runtimeDb);
    const pendingInteractionStore = new PendingInteractionStore(this.runtimeDb);
    const planArtifactStore = new PlanArtifactStore(this.runtimeDb);
    const providerStore = await ProviderStore.load(this.deps.feegleHome);
    const config = configStore.get();
    const sessionStore = await SessionStore.load(this.deps.feegleHome);
    const chatHistory = new ChatHistoryStore();
    const aliasStore = await AliasStore.load(this.deps.feegleHome);
    const repositoryStore = await RepositoryStore.load(this.deps.feegleHome);
    const workspaceStore = await WorkspaceStore.load(this.deps.feegleHome);
    const chatBindingStore = await ChatBindingStore.load(this.deps.feegleHome);
    const agentProviders =
      this.deps.agentProviders ??
      (this.deps.loadAgentProviders
        ? await this.deps.loadAgentProviders(this.deps.feegleHome)
        : buildAgentProviderRegistry({ store: providerStore, config: config.agent }));
    const stockStore = await StockStore.load(this.deps.feegleHome);
    const dedupStore = await DedupStore.load(this.deps.feegleHome);
    const runsLog = await RunsLog.open(this.deps.feegleHome);
    const taskStore = await TaskStore.load(this.deps.feegleHome);
    await taskStore.ensureSeed(defaultSeedTasks());
    const taskRegistry = new TaskRegistry(taskStore);
    const notify = buildNotificationBroker({
      feishuClient: this.deps.feishuClient,
      modules: this.deps.notificationAdapterModules
    });

    const quoteClientId = this.deps.quoteClientId ?? defaultQuoteClientId;
    const quote = requiredQuoteClient(
      buildQuoteClientRegistry({ modules: this.deps.quoteClientModules }).get(quoteClientId),
      quoteClientId
    );
    const kinds = buildHandlerKindRegistry({
      taskRegistry,
      stockStore,
      quote,
      agents: agentProviders,
      modules: this.deps.handlerKindModules
    });

    warnStartupGaps(configStore, taskRegistry, this.deps.ownerEmails);
    this.scheduler = this.deps.createScheduler?.({ notify, configStore, hooks: this.hooks }) ?? new TaskScheduler({
      registry: taskRegistry,
      configStore,
      kinds,
      dedup: dedupStore,
      runsLog,
      notify,
      agents: agentProviders,
      host: new RuntimeHostInfoProvider(),
      clock: { now: () => new Date() },
      logger: new ConsoleJsonLogger(),
      hooks: this.hooks
    });
    await this.scheduler?.start();
    this.hooks?.emit({ event: "scheduler.started" });

    const repositories = new InMemoryRepositoryRegistry();
    const userDirectory = new FeishuUserDirectory(this.deps.feishuClient);
    const registry = buildSlashCommandRegistry({
      feegleHome: this.deps.feegleHome,
      userDirectory,
      repositories,
      repositoryStore,
      workspaceStore,
      chatBindingStore,
      ownerEmails: this.deps.ownerEmails,
      taskRegistry,
      configStore,
      stockStore,
      quote,
      kinds,
      scheduler: this.scheduler as TaskScheduler,
      runsLog,
      providers: agentProviders,
      providerStore,
      sessionStore,
      chatHistory,
      aliasStore,
      modules: this.deps.slashCommandModules
    });
    const chatHandler = new FeishuChatHandler({
      client: this.deps.feishuClient,
      providers: agentProviders,
      history: chatHistory,
      sessionStore,
      workspaceStore,
      chatBindingStore,
      chatWorkspaceStore,
      pendingInteractions: pendingInteractionStore,
      configuredWorkspaces: config.workspaces
    });
    const workbench = new DirectorySetupService({
      chatWorkspaces: chatWorkspaceStore,
      pendingInteractions: pendingInteractionStore,
      chatHandler
    });
    const planArtifacts = new PlanArtifactService({
      feegleHome: this.deps.feegleHome,
      client: this.deps.feishuClient,
      store: planArtifactStore
    });
    const responder = new FeishuCommandResponder(this.deps.feishuClient, {
      registry,
      chatHandler,
      trace: logFeishuCommandTrace,
      configStore,
      taskRegistry,
      userDirectory,
      workbench: {
        handleDirectorySubmit: (input) => workbench.handleDirectorySubmit(input),
        handlePlanRevise: async (input) => ({
          kind: "feishu_card_update",
          card: buildPlanRevisionRequestCard(input.command)
        }),
        handlePlanRevisionSubmit: async (input) => {
          const current = planArtifactStore.latest(input.command.planId);
          if (!current) {
            return { kind: "text", text: `计划不存在：${input.command.planId}` };
          }
          const provider = agentProviders.resolve(current.provider);
          if (!provider) {
            return { kind: "text", text: `计划使用的 agent provider 不存在：${current.provider}` };
          }
          const artifact = await planArtifacts.revisePlan({
            planId: input.command.planId,
            revisionNote: input.command.revisionNote,
            agent: provider.buildAgent()
          });
          return { kind: "text", text: `已生成计划 v${artifact.version}，请查看新文件和确认卡。` };
        }
      }
    });
    this.runtime = this.deps.runtimeFactory(responder);
    await this.runtime.start();
  }

  async stop(): Promise<void> {
    await this.runtime?.stop?.();
    await this.scheduler?.stop?.();
    this.runtimeDb?.close();
    this.hooks?.emit({ event: "scheduler.stopped" });
    await this.lockfileRelease?.();
  }
}

function requiredQuoteClient<T>(client: T | undefined, id: string): T {
  if (!client) {
    throw new Error(`Quote client not registered: ${id}`);
  }
  return client;
}

function defaultSeedTasks(): Task[] {
  const now = new Date().toISOString();
  return [
    {
      id: "seed_heartbeat",
      name: "heartbeat",
      kind: "heartbeat",
      params: {},
      cron: "0 9 * * *",
      timezone: "Asia/Shanghai",
      activeHours: null,
      target: null,
      enabled: true,
      source: "seed",
      errorPolicy: "on-change",
      createdAt: now,
      updatedAt: now,
      lastRun: null,
      consecutiveFailures: 0,
      lastErrorNotifiedAt: null
    }
  ];
}

function warnStartupGaps(configStore: ConfigStorePort, taskRegistry: TaskRegistry, ownerEmails: ReadonlySet<string>): void {
  const tasks = taskRegistry.list();
  if (configStore.get().failureTarget === null && tasks.some((task) => task.enabled)) {
    console.warn("⚠️ failureTarget not configured; enabled tasks exist. Run /error_target set in your target Feishu chat.");
  }
  if (ownerEmails.size === 0 && tasks.some((task) => task.source === "domain" || task.source === "user")) {
    console.warn("⚠️ FEEGLE_OWNER_EMAILS not set; all owner-only commands will be silently denied.");
  }
}
