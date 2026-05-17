import type { PlatformIncomingMessage, PlatformKind } from "../platform/platform-message.js";
import { createPlatformSessionKey } from "../platform/platform-session.js";
import { isAllowedByList, isOldMessage } from "./feishu-dedup.js";
import type { FeishuMessageReceiveEvent } from "./feishu-event-adapter.js";

export interface FeishuMessageExtractOptions {
  platform: Extract<PlatformKind, "feishu" | "lark">;
  botOpenId?: string;
  allowFrom: string;
  allowChat: string;
  groupOnly: boolean;
  groupReplyAll: boolean;
  shareSessionInChannel: boolean;
  threadIsolation: boolean;
}

export function normalizeFeishuTextMessage(
  event: FeishuMessageReceiveEvent,
  options: FeishuMessageExtractOptions,
  text: string
): PlatformIncomingMessage | null {
  const message = event.message;
  if (!message?.message_id || !message.chat_id) {
    return null;
  }

  const senderId = getSenderId(event);
  if (!isAllowedByList(options.allowFrom, senderId) || !isAllowedByList(options.allowChat, message.chat_id)) {
    return null;
  }

  if (options.groupOnly && message.chat_type !== "group") {
    return null;
  }

  if (message.chat_type === "group" && !options.groupReplyAll && !isBotMentioned(event, options.botOpenId)) {
    return null;
  }

  if (isOldMessage(message.create_time)) {
    return null;
  }

  const normalizedText = stripBotMentions(text, event, options.botOpenId);
  const threadId = message.thread_id ?? message.root_id ?? message.parent_id;
  const rootMessageId = options.threadIsolation ? threadId ?? message.message_id : undefined;
  const sessionKey = createPlatformSessionKey({
    platform: options.platform,
    chatId: message.chat_id,
    userId: senderId,
    chatType: message.chat_type ?? "unknown",
    shareSessionInChannel: options.shareSessionInChannel,
    threadIsolation: options.threadIsolation,
    rootMessageId
  });

  return {
    id: message.message_id,
    platform: options.platform,
    chatId: message.chat_id,
    senderId,
    text: normalizedText,
    timestamp: createTimestamp(message.create_time),
    threadId,
    rootMessageId,
    sessionKey,
    raw: event
  };
}

function getSenderId(event: FeishuMessageReceiveEvent): string {
  const senderId = event.sender?.sender_id;
  return senderId?.open_id ?? senderId?.user_id ?? senderId?.union_id ?? "";
}

function isBotMentioned(event: FeishuMessageReceiveEvent, botOpenId: string | undefined): boolean {
  if (!botOpenId) {
    return true;
  }
  return event.message?.mentions?.some((mention) => mention.id?.open_id === botOpenId) ?? false;
}

function stripBotMentions(
  text: string,
  event: FeishuMessageReceiveEvent,
  botOpenId: string | undefined
): string {
  if (!botOpenId) {
    return text.trim();
  }

  return (event.message?.mentions ?? [])
    .filter((mention) => mention.id?.open_id === botOpenId && mention.key)
    .reduce((current, mention) => current.replaceAll(mention.key ?? "", ""), text)
    .trim();
}

function createTimestamp(createTimeMs: string | undefined): Date {
  const parsed = Number(createTimeMs);
  if (!Number.isFinite(parsed)) {
    return new Date();
  }
  return new Date(parsed);
}
