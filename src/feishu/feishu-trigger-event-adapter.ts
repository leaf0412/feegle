import type { TriggerEvent } from "../ingress/trigger-event.js";

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
    actorHint: input.senderUserId ? { platform: "feishu", userId: input.senderUserId } : undefined,
    conversationHint: { chatId: input.chatId },
    payloadSummary: {
      commandType: input.commandType,
      textLength: input.textLength
    }
  };
}
