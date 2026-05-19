import type { FeishuClientPort } from "./feishu-client.js";
import { predictMsgType } from "./feishu-mime.js";

const CHAT_MEMBER_CACHE_TTL_MS = 60 * 60 * 1000;

export function isValidFeishuLookupID(id: string): boolean {
  if (id === "") {
    return false;
  }
  for (const char of id) {
    const code = char.charCodeAt(0);
    const isLower = code >= 0x61 && code <= 0x7a;
    const isUpper = code >= 0x41 && code <= 0x5a;
    const isDigit = code >= 0x30 && code <= 0x39;
    const isSeparator = char === "_" || char === "-";
    if (!isLower && !isUpper && !isDigit && !isSeparator) {
      return false;
    }
  }
  return true;
}

export interface FeishuUserDirectoryOptions {
  now?: () => number;
  cacheTtlMs?: number;
}

export class FeishuUserDirectory {
  private readonly userNameCache = new Map<string, string>();
  private readonly userEmailCache = new Map<string, string>();
  private readonly chatNameCache = new Map<string, string>();
  private readonly chatMembersCache = new Map<string, { fetchedAt: number; nameToId: Map<string, string> }>();
  private readonly now: () => number;
  private readonly cacheTtlMs: number;

  constructor(private readonly client: FeishuClientPort, options: FeishuUserDirectoryOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.cacheTtlMs = options.cacheTtlMs ?? CHAT_MEMBER_CACHE_TTL_MS;
  }

  async resolveUserName(openId: string): Promise<string> {
    if (!isValidFeishuLookupID(openId)) {
      return openId;
    }
    const cached = this.userNameCache.get(openId);
    if (cached !== undefined) {
      return cached;
    }
    const fetched = await this.client.fetchUserName(openId);
    if (fetched === undefined || fetched === "") {
      return openId;
    }
    this.userNameCache.set(openId, fetched);
    return fetched;
  }


  async resolveUserEmail(openId: string): Promise<string> {
    if (!isValidFeishuLookupID(openId)) {
      return "";
    }
    const cached = this.userEmailCache.get(openId);
    if (cached !== undefined) {
      return cached;
    }
    const fetched = await this.client.fetchUserEmail(openId);
    if (fetched === undefined || fetched === "") {
      return "";
    }
    this.userEmailCache.set(openId, fetched);
    return fetched;
  }

  async resolveUserNames(openIds: ReadonlyArray<string>): Promise<Map<string, string>> {
    const unique = Array.from(new Set(openIds));
    const result = new Map<string, string>();
    await Promise.all(
      unique.map(async (id) => {
        result.set(id, await this.resolveUserName(id));
      })
    );
    return result;
  }

  async resolveChatName(chatId: string): Promise<string> {
    if (chatId === "") {
      return "";
    }
    const cached = this.chatNameCache.get(chatId);
    if (cached !== undefined) {
      return cached;
    }
    const fetched = await this.client.fetchChatName(chatId);
    if (fetched === undefined || fetched === "") {
      return chatId;
    }
    this.chatNameCache.set(chatId, fetched);
    return fetched;
  }

  async getChatMembers(chatId: string): Promise<Map<string, string>> {
    const cached = this.chatMembersCache.get(chatId);
    if (cached && this.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.nameToId;
    }
    const members = await this.client.fetchChatMembers(chatId);
    const nameToId = new Map<string, string>();
    for (const member of members) {
      if (nameToId.has(member.name)) {
        nameToId.set(member.name, "");
      } else {
        nameToId.set(member.name, member.memberId);
      }
    }
    this.chatMembersCache.set(chatId, { fetchedAt: this.now(), nameToId });
    return nameToId;
  }
}

export async function resolveMentionsInContent(
  directory: FeishuUserDirectory,
  chatId: string,
  content: string
): Promise<string> {
  if (chatId === "" || !content.includes("@")) {
    return content;
  }
  const members = await directory.getChatMembers(chatId);
  if (members.size === 0) {
    return content;
  }
  const names = Array.from(members.keys()).sort((a, b) => b.length - a.length);
  const useCardFormat = predictMsgType(content) === "interactive";
  let result = content;
  for (const name of names) {
    const pattern = `@${name}`;
    if (!result.includes(pattern)) {
      continue;
    }
    const openId = members.get(name);
    if (!openId) {
      continue;
    }
    const atTag = useCardFormat
      ? `<at id=${openId}></at>`
      : `<at user_id="${openId}">${escapeHtml(name)}</at>`;
    result = result.replaceAll(pattern, atTag);
  }
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
