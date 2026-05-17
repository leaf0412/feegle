import type { FeishuCommand } from "./feishu-gateway.js";
import { parseFeishuCardActionValue, parseFeishuCommand } from "./feishu-gateway.js";
import {
  canRespondToFeishuTextMessage,
  normalizeFeishuTextMessage,
  type FeishuMessageExtractOptions
} from "./feishu-message-normalizer.js";
import type { PlatformIncomingMessage } from "../platform/platform-message.js";

export type { FeishuMessageExtractOptions } from "./feishu-message-normalizer.js";

export interface FeishuCommandEnvelope {
  chatId: string;
  messageId: string;
  command: FeishuCommand;
  shouldRespond?: boolean;
  message?: PlatformIncomingMessage;
}

export interface FeishuPlatformMessageEnvelope extends FeishuCommandEnvelope {
  message: PlatformIncomingMessage;
  shouldRespond: boolean;
}

export interface FeishuMessageReceiveEvent {
  sender?: {
    sender_type?: string;
    sender_id?: {
      open_id?: string;
      union_id?: string;
      user_id?: string;
    };
  };
  message?: {
    message_id?: string;
    chat_id?: string;
    chat_type?: string;
    message_type?: string;
    content?: string;
    create_time?: string;
    mentions?: FeishuMessageMention[];
    thread_id?: string;
    root_id?: string;
    parent_id?: string;
  };
}

export interface FeishuMessageMention {
  id?: {
    open_id?: string;
    union_id?: string;
    user_id?: string;
  };
  name?: string;
  key?: string;
}

export interface FeishuCardActionTriggerEvent {
  context?: {
    open_chat_id?: string;
    open_message_id?: string;
  };
  open_chat_id?: string;
  open_message_id?: string;
  action?: {
    value?: unknown;
  };
}

export function extractTextMessageCommand(event: FeishuMessageReceiveEvent): FeishuCommandEnvelope | null;
export function extractTextMessageCommand(
  event: FeishuMessageReceiveEvent,
  options: FeishuMessageExtractOptions
): FeishuPlatformMessageEnvelope | null;
export function extractTextMessageCommand(
  event: FeishuMessageReceiveEvent,
  options?: FeishuMessageExtractOptions
): FeishuCommandEnvelope | null {
  const message = event.message;
  if (
    event.sender?.sender_type === "app" ||
    !message?.chat_id ||
    !message.message_id ||
    message.message_type !== "text" ||
    typeof message.content !== "string"
  ) {
    return null;
  }

  const text = parseTextContent(message.content);
  if (text === null) {
    return null;
  }

  const platformMessage = options ? normalizeFeishuTextMessage(event, options, text) : null;
  if (options && platformMessage === null) {
    return null;
  }

  const commandText = platformMessage?.text ?? text;
  return {
    chatId: message.chat_id,
    messageId: message.message_id,
    command: parseFeishuCommand(commandText),
    shouldRespond: options ? canRespondToFeishuTextMessage(event, options) : true,
    ...(platformMessage ? { message: platformMessage } : {})
  };
}

export function extractCardActionCommand(event: FeishuCardActionTriggerEvent): FeishuCommandEnvelope | null {
  const chatId = event.context?.open_chat_id ?? event.open_chat_id;
  const messageId = event.context?.open_message_id ?? event.open_message_id;
  if (!chatId || !messageId) {
    return null;
  }

  return {
    chatId,
    messageId,
    shouldRespond: true,
    command: parseFeishuCardActionValue(event.action?.value)
  };
}

function parseTextContent(content: string): string | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (isRecord(parsed) && typeof parsed.text === "string") {
      return parsed.text;
    }
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
