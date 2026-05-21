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
  sender?: { platform: "feishu"; userId: string };
  command: FeishuCommand;
  shouldRespond?: boolean;
  message?: PlatformIncomingMessage;
}

export interface FeishuTextMessageDropReason {
  reason:
    | "app_sender"
    | "missing_message"
    | "missing_chat_id"
    | "missing_message_id"
    | "non_text_message"
    | "missing_content"
    | "invalid_text_content"
    | "blocked_by_options";
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

export interface FeishuBotMenuEvent {
  event_key?: string;
  operator?: {
    operator_id?: {
      open_id?: string;
      union_id?: string;
      user_id?: string;
    };
  };
  event?: {
    event_key?: string;
    operator?: {
      operator_id?: {
        open_id?: string;
        union_id?: string;
        user_id?: string;
      };
    };
  };
  timestamp?: number;
}

export interface FeishuMessageRecalledEvent {
  message_id?: string;
  recall_time?: string;
  recall_type?: string;
  chat_id?: string;
  message?: {
    message_id?: string;
  };
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
    option?: unknown;
    form_value?: unknown;
    tag?: string;
  };
  operator?: {
    open_id?: string;
    union_id?: string;
    user_id?: string;
  };
  user_id?: {
    open_id?: string;
    union_id?: string;
    user_id?: string;
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
  const extracted = explainTextMessageCommand(event, options);
  return extracted.ok ? extracted.envelope : null;
}

export type FeishuTextMessageExtractionResult =
  | { ok: true; envelope: FeishuCommandEnvelope }
  | { ok: false; drop: FeishuTextMessageDropReason };

export function explainTextMessageCommand(
  event: FeishuMessageReceiveEvent,
  options?: FeishuMessageExtractOptions
): FeishuTextMessageExtractionResult {
  const message = event.message;
  if (event.sender?.sender_type === "app") {
    return { ok: false, drop: { reason: "app_sender" } };
  }
  if (!message) {
    return { ok: false, drop: { reason: "missing_message" } };
  }
  if (!message.chat_id) {
    return { ok: false, drop: { reason: "missing_chat_id" } };
  }
  if (!message.message_id) {
    return { ok: false, drop: { reason: "missing_message_id" } };
  }
  if (message.message_type !== "text") {
    return { ok: false, drop: { reason: "non_text_message" } };
  }
  if (typeof message.content !== "string") {
    return { ok: false, drop: { reason: "missing_content" } };
  }

  const text = parseTextContent(message.content);
  if (text === null) {
    return { ok: false, drop: { reason: "invalid_text_content" } };
  }

  const platformMessage = options ? normalizeFeishuTextMessage(event, options, text) : null;
  if (options && platformMessage === null) {
    return { ok: false, drop: { reason: "blocked_by_options" } };
  }

  const commandText = platformMessage?.text ?? text;
  return {
    ok: true,
    envelope: {
      chatId: message.chat_id,
      messageId: message.message_id,
      sender: feishuSender(event.sender?.sender_id),
      command: parseFeishuCommand(commandText),
      shouldRespond: options ? canRespondToFeishuTextMessage(event, options, commandText) : true,
      ...(platformMessage ? { message: platformMessage } : {})
    }
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
    sender: feishuSender(event.operator ?? event.user_id),
    shouldRespond: true,
    command: parseFeishuCardActionValue(resolveCardActionPayload(event.action))
  };
}

function resolveCardActionPayload(action: FeishuCardActionTriggerEvent["action"]): unknown {
  if (!action) return undefined;
  if (typeof action.option !== "string") return mergeFormValue(action.value, action.form_value);
  const payload: Record<string, unknown> = { action: action.option };
  if (
    typeof action.value === "object" &&
    action.value !== null &&
    !Array.isArray(action.value) &&
    typeof (action.value as Record<string, unknown>).session_key === "string"
  ) {
    payload.session_key = (action.value as Record<string, unknown>).session_key;
  }
  return mergeFormValue(payload, action.form_value);
}

function mergeFormValue(value: unknown, formValue: unknown): unknown {
  if (!isRecord(value) || !isRecord(formValue)) {
    return value;
  }
  return { ...value, form_value: formValue };
}

export function extractBotMenuCommand(
  event: FeishuBotMenuEvent,
  options: { now?: () => number } = {}
): FeishuCommandEnvelope | null {
  const eventKey = event.event?.event_key ?? event.event_key;
  if (typeof eventKey !== "string" || eventKey === "") {
    return null;
  }
  const operator = event.event?.operator ?? event.operator;
  const userId =
    operator?.operator_id?.open_id ??
    operator?.operator_id?.user_id ??
    operator?.operator_id?.union_id ??
    "";
  if (userId === "") {
    return null;
  }
  const raw = eventKey.startsWith("/") ? eventKey : `/${eventKey}`;
  const now = options.now ?? (() => Date.now());
  const messageId = `menu:${userId}:${eventKey}:${now()}`;
  return {
    chatId: userId,
    messageId,
    sender: { platform: "feishu", userId },
    shouldRespond: true,
    command: parseFeishuCommand(raw)
  };
}

function feishuSender(
  senderId: { open_id?: string; union_id?: string; user_id?: string } | undefined
): { platform: "feishu"; userId: string } | undefined {
  const userId = senderId?.open_id ?? senderId?.user_id ?? senderId?.union_id;
  return userId ? { platform: "feishu", userId } : undefined;
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
