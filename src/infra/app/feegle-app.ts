import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { BootContext } from "../boot/boot-context.js";
import type { BootReport } from "../boot/boot-phase.js";
import { buildBootPhases } from "../boot/build-boot-phases.js";
import { defaultPlugins } from "../boot/default-plugins.js";
import { collectContributions, type FeeglePlugin } from "../boot/feegle-plugin.js";
import { runBoot } from "../boot/run-boot.js";
import type { FeishuCloudDocClientPort } from "@integrations/feishu/feishu-cloud-doc-client.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import type { FeishuCommandHandler, FeishuRuntimeIngress } from "@integrations/feishu/feishu-long-connection-runtime.js";
import type { SlashCommandModule } from "@platform/slash-command-module.js";
import type { HandlerKindModule } from "@features/scheduler/handler-kind-module.js";
import type { Task } from "@features/scheduler/task.js";
import { defaultQuoteClientId } from "@integrations/stock/default-quote-client-modules.js";
import type { QuoteClientModule } from "@integrations/stock/quote-client-module.js";
import type { ConfigStorePort, ConfigStoreProviderWriter } from "./config-store.js";
import type { HookManager } from "./hooks.js";
import type { NotificationBroker } from "./notification-broker.js";
import type { NotificationAdapterModule } from "./notification-adapter-module.js";
import type { RuntimeDb } from "./runtime-db.js";

export interface Startable {
  start(): Promise<void>;
  stop?(): Promise<void>;
}

export interface FeegleAppDeps {
  feegleHome: string;
  ownerEmails: ReadonlySet<string>;
  feishuClient: FeishuClientPort;
  cloudDoc: FeishuCloudDocClientPort;
  agentProviders?: AgentProviderRegistry;
  loadAgentProviders?: (feegleHome: string) => Promise<AgentProviderRegistry>;
  runtimeFactory: (handler: FeishuCommandHandler, ingress?: FeishuRuntimeIngress) => Startable;
  acquireLock?: (feegleHome: string) => Promise<() => Promise<void>>;
  loadConfigStore?: (feegleHome: string) => Promise<ConfigStoreProviderWriter>;
  createScheduler?: (deps: { notify: NotificationBroker; configStore: ConfigStorePort; hooks?: HookManager }) => Startable;
  /** Inject the full plugin set (tests). When set, the default plugins and the injected-module fields below are ignored. */
  plugins?: readonly FeeglePlugin[];
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
  private runtimeDb?: RuntimeDb;
  private report?: BootReport;

  constructor(private readonly deps: FeegleAppDeps) {}

  async start(): Promise<void> {
    const ctx = new BootContext();
    const contributions = collectContributions(this.resolvePlugins());
    const phases = buildBootPhases({
      appDeps: this.deps,
      contributions,
      quoteClientId: this.deps.quoteClientId ?? defaultQuoteClientId,
      seedTasks: defaultSeedTasks(),
      onLockRelease: (release) => {
        this.lockfileRelease = release;
      },
      onScheduler: (scheduler) => {
        this.scheduler = scheduler;
      },
      onRuntime: (runtime) => {
        this.runtime = runtime;
      }
    });
    this.report = await runBoot(phases, ctx);
    this.runtimeDb = ctx.require("runtimeDb");
  }

  bootReport(): BootReport | undefined {
    return this.report;
  }

  async stop(): Promise<void> {
    await this.runtime?.stop?.();
    await this.scheduler?.stop?.();
    this.runtimeDb?.close();
    this.deps.hooks?.emit({ event: "scheduler.stopped" });
    await this.lockfileRelease?.();
  }

  private resolvePlugins(): readonly FeeglePlugin[] {
    if (this.deps.plugins) {
      return this.deps.plugins;
    }
    const base = defaultPlugins({
      feegleHome: this.deps.feegleHome,
      feishuClient: this.deps.feishuClient,
      cloudDoc: this.deps.cloudDoc,
      runtimeFactory: this.deps.runtimeFactory
    });
    const injected = this.injectedModulesPlugin();
    return injected ? [...base, injected] : base;
  }

  private injectedModulesPlugin(): FeeglePlugin | undefined {
    const handlerKinds = this.deps.handlerKindModules ?? [];
    const slashCommands = this.deps.slashCommandModules ?? [];
    const quoteClients = this.deps.quoteClientModules ?? [];
    const notificationAdapters = this.deps.notificationAdapterModules ?? [];
    if (
      handlerKinds.length === 0 &&
      slashCommands.length === 0 &&
      quoteClients.length === 0 &&
      notificationAdapters.length === 0
    ) {
      return undefined;
    }
    return { id: "injected-modules", handlerKinds, slashCommands, quoteClients, notificationAdapters };
  }
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
