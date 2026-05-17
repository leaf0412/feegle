import type { FeishuCommand } from "./feishu-gateway.js";
import { parseFeishuPlatformConfig, type FeishuPlatformConfigInput } from "./feishu-platform-config.js";
import {
  extractCardActionCommand,
  extractTextMessageCommand,
  type FeishuCardActionTriggerEvent,
  type FeishuMessageReceiveEvent
} from "./feishu-event-adapter.js";
import { FeishuMessageDedup } from "./feishu-dedup.js";

export interface FeishuLongConnectionConfig extends FeishuPlatformConfigInput {}

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
  private readonly dedup = new FeishuMessageDedup();
  private readonly platformConfig;

  constructor(
    private readonly config: FeishuLongConnectionConfig,
    private readonly sdk: FeishuLongConnectionSdk,
    private readonly handler: FeishuCommandHandler
  ) {
    this.platformConfig = parseFeishuPlatformConfig(config);
  }

  async start(): Promise<void> {
    const eventDispatcher = new this.sdk.EventDispatcher({
      verificationToken: this.config.verificationToken,
      encryptKey: this.config.encryptKey
    }).register({
      "im.message.receive_v1": async (event) => {
        const envelope = extractTextMessageCommand(event, {
          platform: "feishu",
          botOpenId: this.platformConfig.botOpenId,
          allowFrom: this.platformConfig.allowFrom,
          allowChat: this.platformConfig.allowChat,
          groupOnly: this.platformConfig.groupOnly,
          groupReplyAll: this.platformConfig.groupReplyAll,
          shareSessionInChannel: this.platformConfig.shareSessionInChannel,
          threadIsolation: this.platformConfig.threadIsolation
        });
        if (envelope && this.markUnhandled("message", envelope.messageId)) {
          void this.handler
            .handleCommand({
              source: "message",
              chatId: envelope.chatId,
              messageId: envelope.messageId,
              command: envelope.command
            })
            .catch((error) => console.error("Feishu message handler failed", error));
        }
      },
      "card.action.trigger": async (event) => {
        const envelope = extractCardActionCommand(event);
        if (envelope && this.markUnhandled("card", envelope.messageId)) {
          void this.handler
            .handleCommand({ source: "card", ...envelope })
            .catch((error) => console.error("Feishu card handler failed", error));
        }
      }
    });

    const wsClient = new this.sdk.WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret
    });

    await wsClient.start({ eventDispatcher });
  }

  private markUnhandled(source: "message" | "card", messageId: string): boolean {
    return this.dedup.mark(`${source}:${messageId}`);
  }
}
