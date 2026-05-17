import type { FeishuCommand } from "./feishu-gateway.js";
import {
  extractCardActionCommand,
  extractTextMessageCommand,
  type FeishuCardActionTriggerEvent,
  type FeishuMessageReceiveEvent
} from "./feishu-event-adapter.js";

export interface FeishuLongConnectionConfig {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
}

export interface FeishuCommandHandler {
  handleCommand(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    command: FeishuCommand;
  }): Promise<void>;
}

export interface FeishuLongConnectionSdk {
  EventDispatcher: new (params: {
    verificationToken?: string;
    encryptKey?: string;
  }) => FeishuEventDispatcher;
  WSClient: new (params: {
    appId: string;
    appSecret: string;
  }) => FeishuWsClient;
}

export interface FeishuEventDispatcher {
  register(handles: {
    "im.message.receive_v1": (event: FeishuMessageReceiveEvent) => Promise<void>;
    "card.action.trigger": (event: FeishuCardActionTriggerEvent) => Promise<void>;
  }): FeishuEventDispatcher;
}

export interface FeishuWsClient {
  start(input: { eventDispatcher: FeishuEventDispatcher }): Promise<void>;
}

export class FeishuLongConnectionRuntime {
  constructor(
    private readonly config: FeishuLongConnectionConfig,
    private readonly sdk: FeishuLongConnectionSdk,
    private readonly handler: FeishuCommandHandler
  ) {}

  async start(): Promise<void> {
    const eventDispatcher = new this.sdk.EventDispatcher({
      verificationToken: this.config.verificationToken,
      encryptKey: this.config.encryptKey
    }).register({
      "im.message.receive_v1": async (event) => {
        const envelope = extractTextMessageCommand(event);
        if (envelope) {
          await this.handler.handleCommand({ source: "message", ...envelope });
        }
      },
      "card.action.trigger": async (event) => {
        const envelope = extractCardActionCommand(event);
        if (envelope) {
          await this.handler.handleCommand({ source: "card", ...envelope });
        }
      }
    });

    const wsClient = new this.sdk.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret
    });

    await wsClient.start({ eventDispatcher });
  }
}
