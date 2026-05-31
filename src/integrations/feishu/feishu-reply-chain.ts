import type { FeishuClientPort, FeishuFetchedMessage } from "./feishu-client.js";
import {
  extractInteractiveCardText,
  extractPostPlainText,
  replaceMentions
} from "./feishu-content-extractor.js";
import type { FeishuUserDirectory } from "./feishu-user-directory.js";

export const MAX_REPLY_CHAIN_DEPTH = 5;

export interface ChainMessage {
  senderName: string;
  senderType: "user" | "app" | "unknown";
  text: string;
  parentId?: string;
}

export interface ReplyChainOptions {
  maxDepth?: number;
  peerBots?: ReadonlyMap<string, string>;
}

export async function fetchReplyChain(
  client: FeishuClientPort,
  directory: FeishuUserDirectory,
  startMessageId: string,
  options: ReplyChainOptions = {}
): Promise<ChainMessage[]> {
  const maxDepth = options.maxDepth ?? MAX_REPLY_CHAIN_DEPTH;
  const chain: ChainMessage[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = startMessageId;

  while (currentId && chain.length < maxDepth) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    const message = await client.fetchMessage(currentId);
    if (!message) {
      break;
    }
    const chainMessage = await buildChainMessage(message, directory, options.peerBots);
    if (!chainMessage) {
      break;
    }
    chain.push(chainMessage);
    currentId = message.parentId;
  }
  return chain.reverse();
}

export async function fetchQuotedMessage(
  client: FeishuClientPort,
  directory: FeishuUserDirectory,
  startMessageId: string,
  options: ReplyChainOptions = {}
): Promise<string> {
  const chain = await fetchReplyChain(client, directory, startMessageId, options);
  return formatReplyChain(chain);
}

export function formatReplyChain(chain: ReadonlyArray<ChainMessage>): string {
  if (chain.length === 0) {
    return "";
  }
  if (chain.length === 1) {
    return `[Quoted message from ${chain[0].senderName}]:\n${chain[0].text}\n\n`;
  }
  const lines: string[] = [`--- Reply chain (${chain.length} messages) ---`];
  chain.forEach((message, index) => {
    const role = message.senderType === "app" ? "assistant" : "user";
    lines.push(`[${index + 1}] ${message.senderName} (${role}):\n${message.text}\n`);
  });
  lines.push("---\n");
  return lines.join("\n");
}

async function buildChainMessage(
  message: FeishuFetchedMessage,
  directory: FeishuUserDirectory,
  peerBots: ReadonlyMap<string, string> | undefined
): Promise<ChainMessage | null> {
  const content = message.content;
  if (content === undefined || content === "") {
    return null;
  }
  const text = renderMessageText(message.messageType, content, message.mentions);
  if (text === "") {
    return null;
  }
  const senderName = await resolveSender(message, directory, peerBots);
  const senderType = normaliseSenderType(message.senderType);
  return {
    senderName,
    senderType,
    text,
    parentId: message.parentId
  };
}

function renderMessageText(
  messageType: string,
  content: string,
  mentions: ReadonlyArray<{ key?: string; name?: string }>
): string {
  if (messageType === "text") {
    let text = "";
    try {
      const parsed: unknown = JSON.parse(content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof (parsed as { text?: unknown }).text === "string") {
        text = (parsed as { text: string }).text;
      }
    } catch {
      return "";
    }
    return replaceMentions(text, mentions);
  }
  if (messageType === "post") {
    return extractPostPlainText(content);
  }
  if (messageType === "interactive") {
    return extractInteractiveCardText(content);
  }
  return `[${messageType}]`;
}

async function resolveSender(
  message: FeishuFetchedMessage,
  directory: FeishuUserDirectory,
  peerBots: ReadonlyMap<string, string> | undefined
): Promise<string> {
  const senderId = message.senderId ?? "";
  const senderType = message.senderType ?? "";
  if (senderId === "") {
    return "unknown";
  }
  if (senderType === "app") {
    if (peerBots) {
      const alias = peerBots.get(senderId);
      if (alias !== undefined && alias !== "") {
        return alias;
      }
    }
    return `Bot[${senderId}]`;
  }
  const name = await directory.resolveUserName(senderId);
  return name === senderId ? "User" : name;
}

function normaliseSenderType(senderType: string | undefined): "user" | "app" | "unknown" {
  if (senderType === "app") {
    return "app";
  }
  if (senderType === "user") {
    return "user";
  }
  return "unknown";
}
