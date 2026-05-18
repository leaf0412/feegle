import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import { ChatHistoryStore } from "../agent/chat-history-store.js";
import { FeishuChatHandler } from "../feishu/feishu-chat-handler.js";
import { FeishuCommandResponder, logFeishuCommandTrace } from "../feishu/feishu-command-responder.js";
import type { FeishuClientPort } from "../feishu/feishu-client.js";
import type { FeishuCommandHandler } from "../feishu/feishu-long-connection-runtime.js";
import { buildSlashCommandRegistry } from "../platform/build-slash-command-registry.js";
import { InMemoryRepositoryRegistry } from "../repositories/repository-registry.js";
import { ConfigStore } from "./config-store.js";
import { acquireFeegleLock } from "./feegle-lock.js";
import { NotificationBroker } from "./notification-broker.js";
import { FeishuNotificationAdapter } from "../feishu/feishu-notification-adapter.js";

export interface Startable {
  start(): Promise<void>;
  stop?(): Promise<void>;
}

export interface FeegleAppDeps {
  feegleHome: string;
  ownerIdentities: ReadonlySet<string>;
  feishuClient: FeishuClientPort;
  agentProviders: AgentProviderRegistry;
  runtimeFactory: (handler: FeishuCommandHandler) => Startable;
  acquireLock?: (feegleHome: string) => Promise<() => Promise<void>>;
  loadConfigStore?: (feegleHome: string) => Promise<unknown>;
  createScheduler?: (deps: { notify: NotificationBroker; configStore: unknown }) => Startable;
}

export class FeegleApp {
  private lockfileRelease?: () => Promise<void>;
  private scheduler?: Startable;
  private runtime?: Startable;

  constructor(private readonly deps: FeegleAppDeps) {}

  async start(): Promise<void> {
    this.lockfileRelease = await (this.deps.acquireLock ?? acquireFeegleLock)(this.deps.feegleHome);
    const configStore = await (this.deps.loadConfigStore ?? ConfigStore.load)(this.deps.feegleHome);
    const notify = new NotificationBroker({
      feishu: new FeishuNotificationAdapter(this.deps.feishuClient)
    });

    this.scheduler = this.deps.createScheduler?.({ notify, configStore });
    await this.scheduler?.start();

    const repositories = new InMemoryRepositoryRegistry();
    const registry = buildSlashCommandRegistry({ repositories });
    const chatHandler = new FeishuChatHandler({
      client: this.deps.feishuClient,
      providers: this.deps.agentProviders,
      history: new ChatHistoryStore()
    });
    const responder = new FeishuCommandResponder(this.deps.feishuClient, {
      registry,
      chatHandler,
      trace: logFeishuCommandTrace
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
