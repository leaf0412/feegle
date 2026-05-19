import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import { buildAgentProviderRegistry } from "../agent/build-agent-provider-registry.js";
import { ChatHistoryStore } from "../agent/chat-history-store.js";
import { ProviderStore } from "../agent/provider-store.js";
import { FeishuChatHandler } from "../feishu/feishu-chat-handler.js";
import { FeishuCommandResponder, logFeishuCommandTrace } from "../feishu/feishu-command-responder.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import type { FeishuCommandHandler } from "../feishu/feishu-long-connection-runtime.js";
import { buildSlashCommandRegistry } from "../platform/build-slash-command-registry.js";
import type { SlashCommandModule } from "../platform/slash-command-module.js";
import { InMemoryRepositoryRegistry } from "../repositories/repository-registry.js";
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
import { NotificationBroker } from "./notification-broker.js";
import type { NotificationAdapterModule } from "./notification-adapter-module.js";

export interface Startable {
  start(): Promise<void>;
  stop?(): Promise<void>;
}

export interface FeegleAppDeps {
  feegleHome: string;
  ownerIdentities: ReadonlySet<string>;
  feishuClient: FeishuClientPort;
  agentProviders?: AgentProviderRegistry;
  loadAgentProviders?: (feegleHome: string) => Promise<AgentProviderRegistry>;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
  acquireLock?: (feegleHome: string) => Promise<() => Promise<void>>;
  loadConfigStore?: (feegleHome: string) => Promise<ConfigStorePort>;
  createScheduler?: (deps: { notify: NotificationBroker; configStore: ConfigStorePort }) => Startable;
  slashCommandModules?: readonly SlashCommandModule[];
  handlerKindModules?: readonly HandlerKindModule[];
  quoteClientModules?: readonly QuoteClientModule[];
  quoteClientId?: string;
  notificationAdapterModules?: readonly NotificationAdapterModule[];
}

export class FeegleApp {
  private lockfileRelease?: () => Promise<void>;
  private scheduler?: Startable;
  private runtime?: Startable;

  constructor(private readonly deps: FeegleAppDeps) {}

  async start(): Promise<void> {
    this.lockfileRelease = await (this.deps.acquireLock ?? acquireFeegleLock)(this.deps.feegleHome);
    const configStore = await (this.deps.loadConfigStore ?? ConfigStore.load)(this.deps.feegleHome);
    const providerStore = await ProviderStore.load(this.deps.feegleHome);
    const agentProviders =
      this.deps.agentProviders ??
      (this.deps.loadAgentProviders
        ? await this.deps.loadAgentProviders(this.deps.feegleHome)
        : buildAgentProviderRegistry({ store: providerStore }));
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

    warnStartupGaps(configStore, taskRegistry, this.deps.ownerIdentities);
    this.scheduler = this.deps.createScheduler?.({ notify, configStore }) ?? new TaskScheduler({
      registry: taskRegistry,
      configStore,
      kinds,
      dedup: dedupStore,
      runsLog,
      notify,
      agents: agentProviders,
      host: new RuntimeHostInfoProvider(),
      clock: { now: () => new Date() },
      logger: new ConsoleJsonLogger()
    });
    await this.scheduler?.start();

    const repositories = new InMemoryRepositoryRegistry();
    const registry = buildSlashCommandRegistry({
      repositories,
      ownerIdentities: this.deps.ownerIdentities,
      taskRegistry,
      configStore,
      stockStore,
      quote,
      kinds,
      scheduler: this.scheduler as TaskScheduler,
      runsLog,
      providers: agentProviders,
      providerStore,
      modules: this.deps.slashCommandModules
    });
    const chatHandler = new FeishuChatHandler({
      client: this.deps.feishuClient,
      providers: agentProviders,
      history: new ChatHistoryStore()
    });
    const responder = new FeishuCommandResponder(this.deps.feishuClient, {
      registry,
      chatHandler,
      trace: logFeishuCommandTrace,
      configStore,
      taskRegistry
    });
    this.runtime = this.deps.runtimeFactory(responder);
    await this.runtime.start();
  }

  async stop(): Promise<void> {
    await this.runtime?.stop?.();
    await this.scheduler?.stop?.();
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

function warnStartupGaps(configStore: ConfigStorePort, taskRegistry: TaskRegistry, ownerIdentities: ReadonlySet<string>): void {
  const tasks = taskRegistry.list();
  if (configStore.get().failureTarget === null && tasks.some((task) => task.enabled)) {
    console.warn("⚠️ failureTarget not configured; enabled tasks exist. Run /error_target set in your target Feishu chat.");
  }
  if (ownerIdentities.size === 0 && tasks.some((task) => task.source === "domain" || task.source === "user")) {
    console.warn("⚠️ FEEGLE_OWNER_IDENTITIES not set; all owner-only commands will be silently denied.");
  }
}
