import type { TriggerEvent } from "@core/ingress/trigger-event.js";

export function feishuMessageEnvelopeToTriggerEvent(input: {
  triggerEventId: string;
  receivedAt: string;
  chatId: string;
  messageId: string;
  senderUserId?: string;
  commandType: string;
  textLength: number;
  raw?: string;
  shouldRespond?: boolean;
  chatType?: string;
  sessionKey?: string;
}): TriggerEvent {
  return {
    triggerEventId: input.triggerEventId,
    source: {
      pluginId: "feishu",
      adapterId: "long_connection",
      triggerType: "message"
    },
    receivedAt: input.receivedAt,
    external: {
      chatId: input.chatId,
      messageId: input.messageId,
      commandType: input.commandType,
      raw: input.raw,
      shouldRespond: input.shouldRespond,
      chatType: input.chatType,
      sessionKey: input.sessionKey
    },
    actorHint: input.senderUserId
      ? { provider: "feishu", externalUserId: input.senderUserId }
      : undefined,
    conversationHint: { conversationKey: `feishu:${input.chatId}` },
    payloadSummary: {
      commandType: input.commandType,
      textLength: input.textLength,
      shouldRespond: input.shouldRespond
    }
  };
}

export function feishuCardActionToTriggerEvent(input: {
  triggerEventId: string;
  receivedAt: string;
  chatId: string;
  messageId: string;
  senderUserId?: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
}): TriggerEvent {
  return {
    triggerEventId: input.triggerEventId,
    source: {
      pluginId: "feishu",
      adapterId: "long_connection",
      triggerType: "card_action"
    },
    receivedAt: input.receivedAt,
    external: {
      chatId: input.chatId,
      messageId: input.messageId,
      actionType: input.actionType,
      actionPayload: input.actionPayload
    },
    actorHint: input.senderUserId
      ? { provider: "feishu", externalUserId: input.senderUserId }
      : undefined,
    conversationHint: { conversationKey: `feishu:${input.chatId}` },
    payloadSummary: {
      actionType: input.actionType
    }
  };
}

export function feishuBotMenuToTriggerEvent(input: {
  triggerEventId: string;
  receivedAt: string;
  chatId: string;
  messageId: string;
  senderUserId: string;
  commandText: string;
}): TriggerEvent {
  return {
    triggerEventId: input.triggerEventId,
    source: {
      pluginId: "feishu",
      adapterId: "long_connection",
      triggerType: "bot_menu"
    },
    receivedAt: input.receivedAt,
    external: {
      chatId: input.chatId,
      messageId: input.messageId,
      commandText: input.commandText
    },
    actorHint: { provider: "feishu", externalUserId: input.senderUserId },
    conversationHint: { conversationKey: `feishu:${input.chatId}` },
    payloadSummary: {
      commandText: input.commandText
    }
  };
}
