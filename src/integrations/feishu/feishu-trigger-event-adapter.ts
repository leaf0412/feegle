import type { TriggerEvent } from "../../ingress/trigger-event.js";

export function feishuMessageEnvelopeToTriggerEvent(input: {
  triggerEventId: string;
  receivedAt: string;
  chatId: string;
  messageId: string;
  senderUserId?: string;
  commandType: string;
  textLength: number;
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
      messageId: input.messageId
    },
    actorHint: input.senderUserId
      ? { provider: "feishu", externalUserId: input.senderUserId }
      : undefined,
    conversationHint: { conversationKey: `feishu:${input.chatId}` },
    payloadSummary: {
      commandType: input.commandType,
      textLength: input.textLength
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
