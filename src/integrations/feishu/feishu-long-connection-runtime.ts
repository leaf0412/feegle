import type { FeishuCommand } from "./feishu-gateway.js";
import type { FeishuPlatformConfig } from "./feishu-platform-config.js";
import { feishuMessageEnvelopeToTriggerEvent } from "./feishu-trigger-event-adapter.js";
import {
  extractBotMenuCommand,
  extractCardActionCommand,
  explainTextMessageCommand,
  type FeishuBotMenuEvent,
  type FeishuCardActionTriggerEvent,
  type FeishuMessageReceiveEvent,
  type FeishuMessageRecalledEvent
} from "./feishu-event-adapter.js";
import { FeishuMessageDedup } from "./feishu-dedup.js";
import { FeishuRecallTracker } from "./feishu-recall-tracker.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

export interface FeishuLongConnectionConfig extends FeishuPlatformConfig {}

export interface FeishuCommandHandler {
  handleCommand(input: {
    source: "message" | "card";
    chatId: string;
    messageId: string;
    sender?: { platform: "feishu"; userId: string };
    sessionKey?: string;
    chatType?: string;
    command: FeishuCommand;
    shouldRespond?: boolean;
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
    "im.message.recalled_v1"?: (event: FeishuMessageRecalledEvent) => Promise<void>;
    "application.bot.menu_v6"?: (event: FeishuBotMenuEvent) => Promise<void>;
  }): FeishuEventDispatcher;
}

export interface FeishuWsClient {
  start(input: { eventDispatcher: FeishuEventDispatcher }): Promise<void>;
}

export interface FeishuRuntimeIngress {
  dispatch(event: TriggerEvent): Promise<{ status: "succeeded" | "failed" | "waiting" }>;
}

export class FeishuLongConnectionRuntime {
  private readonly dedup = new FeishuMessageDedup();
  private readonly platformConfig: FeishuPlatformConfig;
  readonly recallTracker = new FeishuRecallTracker();

  constructor(
    private readonly config: FeishuLongConnectionConfig,
    private readonly sdk: FeishuLongConnectionSdk,
    private readonly handler: FeishuCommandHandler,
    private readonly ingress?: FeishuRuntimeIngress
  ) {
    // config is already the parsed/resolved platform config (entry → resolveFeishuEntryConfig);
    // consume it directly instead of re-parsing (re-parsing would resurrect reactionEmoji="none" → "OnIt").
    this.platformConfig = config;
  }

  async start(): Promise<void> {
    const eventDispatcher = new this.sdk.EventDispatcher({
      verificationToken: this.config.verificationToken,
      encryptKey: this.config.encryptKey
    }).register({
      "im.message.receive_v1": async (event) => {
        console.info("Feishu message event received", summarizeMessageEvent(event));
        const extraction = explainTextMessageCommand(event, {
          platform: "feishu",
          botOpenId: this.platformConfig.botOpenId,
          allowFrom: this.platformConfig.allowFrom,
          allowChat: this.platformConfig.allowChat,
          groupOnly: this.platformConfig.groupOnly,
          groupReplyAll: this.platformConfig.groupReplyAll,
          shareSessionInChannel: this.platformConfig.shareSessionInChannel,
          threadIsolation: this.platformConfig.threadIsolation
        });
        if (!extraction.ok) {
          console.warn("Feishu message event ignored", {
            ...summarizeMessageEvent(event),
            reason: extraction.drop.reason
          });
          return;
        }
        const envelope = extraction.envelope;
        console.info("Feishu message routed", {
          source: "message",
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          commandType: envelope.command.type,
          shouldRespond: envelope.shouldRespond
        });
        if (envelope && this.markUnhandled("message", envelope.messageId)) {
          if (this.ingress) {
            await this.ingress.dispatch(
              feishuMessageEnvelopeToTriggerEvent({
                triggerEventId: `feishu:${envelope.messageId}`,
                receivedAt: new Date().toISOString(),
                chatId: envelope.chatId,
                messageId: envelope.messageId,
                senderUserId: envelope.sender?.userId,
                commandType: envelope.command.type,
                textLength: envelope.command.type === "chat" ? envelope.command.raw.length : 0
              })
            );
          }
          void this.handler // acceptance-allow-handleCommand
            .handleCommand({
              source: "message",
              chatId: envelope.chatId,
              messageId: envelope.messageId,
              sender: envelope.sender,
              sessionKey: envelope.message?.sessionKey,
              chatType: envelope.chatType,
              command: envelope.command,
              shouldRespond: envelope.shouldRespond
            })
            .catch((error) => console.error("Feishu message handler failed", error));
        }
      },
      "card.action.trigger": async (event) => {
        console.info("Feishu card action received", summarizeCardActionEvent(event));
        const envelope = extractCardActionCommand(event);
        if (!envelope) {
          console.warn("Feishu card action ignored", summarizeCardActionEvent(event));
          return;
        }
        console.info("Feishu card action routed", {
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          commandType: envelope.command.type
        });
        if (envelope) {
          void this.handler // acceptance-allow-handleCommand
            .handleCommand({ source: "card", ...envelope })
            .catch((error) => console.error("Feishu card handler failed", error));
        }
      },
      "im.message.recalled_v1": async (event) => {
        const messageId = event.message_id ?? event.message?.message_id;
        if (typeof messageId === "string" && messageId !== "") {
          this.recallTracker.mark(messageId);
          console.info("Feishu message recalled", { messageId });
        }
      },
      "application.bot.menu_v6": async (event) => {
        const envelope = extractBotMenuCommand(event);
        if (!envelope) {
          console.warn("Feishu bot menu ignored", { eventKey: event.event?.event_key ?? event.event_key });
          return;
        }
        console.info("Feishu bot menu routed", {
          chatId: envelope.chatId,
          messageId: envelope.messageId,
          commandType: envelope.command.type
        });
        if (this.markUnhandled("message", envelope.messageId)) {
          void this.handler // acceptance-allow-handleCommand
            .handleCommand({
              source: "message",
              chatId: envelope.chatId,
              messageId: envelope.messageId,
              sender: envelope.sender,
              chatType: envelope.chatType,
              command: envelope.command,
              shouldRespond: envelope.shouldRespond
            })
            .catch((error) => console.error("Feishu bot menu handler failed", error));
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

function summarizeMessageEvent(event: FeishuMessageReceiveEvent): Record<string, unknown> {
  return {
    messageId: event.message?.message_id,
    chatId: event.message?.chat_id,
    chatType: event.message?.chat_type,
    messageType: event.message?.message_type,
    senderType: event.sender?.sender_type,
    mentionCount: event.message?.mentions?.length ?? 0
  };
}

function summarizeCardActionEvent(event: FeishuCardActionTriggerEvent): Record<string, unknown> {
  return {
    messageId: event.context?.open_message_id ?? event.open_message_id,
    chatId: event.context?.open_chat_id ?? event.open_chat_id
  };
}
