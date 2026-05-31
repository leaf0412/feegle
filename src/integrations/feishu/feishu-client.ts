import { createReadStream } from "node:fs";
import type { ReadStream } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
import type { PlatformProgressSnapshot } from "@platform/progress.js";
import { detectMimeType } from "./feishu-mime.js";
import type { FeishuFileType } from "./feishu-mime.js";
import { renderFeishuProgressCard } from "./feishu-progress-card.js";

export interface FeishuRawRequest {
  url: string;
  method: string;
  data?: unknown;
  params?: Record<string, string | number | undefined>;
}

export interface FeishuOpenApiClient {
  request?(payload: FeishuRawRequest): Promise<unknown>;
  contact?: unknown;
  im: {
    v1: {
      file?: {
        create(input: {
          data: {
            file_name: string;
            file_type: FeishuFileType;
            file: ReadStream | Buffer;
          };
        }): Promise<{ data?: { file_key?: string } } | { file_key?: string } | null>;
      };
      image?: {
        create(input: {
          data: {
            image_type: "message" | "avatar";
            image: Buffer | ReadStream;
          };
        }): Promise<{ data?: { image_key?: string } } | { image_key?: string } | null>;
      };
      messageResource?: {
        get(input: {
          params: { type: string };
          path: { message_id: string; file_key: string };
        }): Promise<{
          writeFile?: (filePath: string) => Promise<unknown>;
          getReadableStream?: () => Readable;
          headers?: Record<string, string | string[]>;
        }>;
      };
      message: {
        create(input: {
          params: { receive_id_type: "chat_id" };
          data: {
            receive_id: string;
            msg_type: "text" | "interactive" | "file";
            content: string;
          };
        }): Promise<{ data?: { message_id?: string } }>;
        patch(input: {
          path: { message_id: string };
          data: {
            content: string;
          };
        }): Promise<unknown>;
        reply?(input: {
          path: { message_id: string };
          data: {
            msg_type: "text" | "interactive" | "file";
            content: string;
          };
        }): Promise<{ data?: { message_id?: string } }>;
        delete?(input: { path: { message_id: string } }): Promise<unknown>;
      };
      messageReaction?: {
        create(input: {
          path: { message_id: string };
          data: { reaction_type: { emoji_type: string } };
        }): Promise<{ data?: { reaction_id?: string } }>;
        delete(input: {
          path: { message_id: string; reaction_id: string };
        }): Promise<unknown>;
      };
      chat?: unknown;
      chatMembers?: unknown;
    };
  };
}

interface ContactUserGetApi {
  v3: {
    user: {
      get(input: {
        path: { user_id: string };
        params: { user_id_type: "open_id" | "user_id" | "union_id" };
      }): Promise<unknown>;
    };
  };
}

interface ChatGetApi {
  get(input: { path: { chat_id: string } }): Promise<unknown>;
}

interface ChatMembersApi {
  getByIterator?(input: {
    path: { chat_id: string };
    params: { member_id_type: "open_id"; page_size: number };
  }): Promise<AsyncIterable<unknown>> | AsyncIterable<unknown>;
  list?(input: {
    path: { chat_id: string };
    params: { member_id_type: "open_id"; page_size: number; page_token?: string };
  }): Promise<unknown>;
}

export interface FeishuClientPort {
  sendText(chatId: string, text: string): Promise<string | undefined>;
  sendInteractiveCard(chatId: string, card: unknown): Promise<string | undefined>;
  sendFile(chatId: string, filePath: string): Promise<string | undefined>;
  replyText(messageId: string, text: string): Promise<string | undefined>;
  replyInteractiveCard(messageId: string, card: unknown): Promise<string | undefined>;
  updateInteractiveCard(messageId: string, card: unknown): Promise<void>;
  updateProgress(messageId: string, progress: PlatformProgressSnapshot): Promise<void>;
  addReaction(messageId: string, emojiType: string): Promise<string | undefined>;
  removeReaction(messageId: string, reactionId: string): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  fetchBotOpenId(): Promise<string | undefined>;
  fetchUserName(openId: string): Promise<string | undefined>;
  fetchUserEmail(openId: string): Promise<string | undefined>;
  fetchChatName(chatId: string): Promise<string | undefined>;
  fetchChatMembers(chatId: string): Promise<Array<{ memberId: string; name: string }>>;
  fetchMessage(messageId: string): Promise<FeishuFetchedMessage | undefined>;
  fetchMergeForwardItems(messageId: string): Promise<FeishuMergeForwardItem[]>;
  sendImage(chatId: string, image: Buffer): Promise<string | undefined>;
  sendAudio(chatId: string, audio: Buffer, options?: { format?: "opus"; fileName?: string }): Promise<string | undefined>;
  downloadResource(
    messageId: string,
    fileKey: string,
    type: "image" | "file"
  ): Promise<Buffer | undefined>;
  downloadImage(messageId: string, imageKey: string): Promise<{ data: Buffer; mimeType?: string } | undefined>;
}

export interface FeishuFetchedMessageMention {
  key?: string;
  name?: string;
}

export interface FeishuFetchedMessage {
  messageType: string;
  parentId?: string;
  senderId?: string;
  senderType?: string;
  content?: string;
  mentions: FeishuFetchedMessageMention[];
}

export interface FeishuMergeForwardItem {
  messageId: string;
  messageType: string;
  upperMessageId?: string;
  senderId?: string;
  senderType?: string;
  createTimeMs?: number;
  content?: string;
  mentions: FeishuFetchedMessageMention[];
}

export class LarkFeishuClient implements FeishuClientPort {
  constructor(private readonly client: FeishuOpenApiClient) {}

  async sendText(chatId: string, text: string): Promise<string | undefined> {
    const response = await this.client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text })
      }
    });

    return response.data?.message_id;
  }

  async sendInteractiveCard(chatId: string, card: unknown): Promise<string | undefined> {
    const response = await this.client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "interactive",
        content: JSON.stringify(card)
      }
    });

    return response.data?.message_id;
  }

  async replyText(messageId: string, text: string): Promise<string | undefined> {
    const response = await this.reply(messageId, "text", JSON.stringify({ text }));
    return response.data?.message_id;
  }

  async replyInteractiveCard(messageId: string, card: unknown): Promise<string | undefined> {
    const response = await this.reply(messageId, "interactive", JSON.stringify(card));
    return response.data?.message_id;
  }

  async sendFile(chatId: string, filePath: string): Promise<string | undefined> {
    if (!this.client.im.v1.file) {
      throw new Error("Feishu file API client is not configured");
    }

    const uploadResponse = await this.client.im.v1.file.create({
      data: {
        file_name: basename(filePath),
        file_type: "stream",
        file: createReadStream(filePath)
      }
    });
    const fileKey = extractFileKey(uploadResponse);
    if (!fileKey) {
      throw new Error("Feishu file upload did not return file_key");
    }

    const messageResponse = await this.client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "file",
        content: JSON.stringify({ file_key: fileKey })
      }
    });

    return messageResponse.data?.message_id;
  }

  async updateInteractiveCard(messageId: string, card: unknown): Promise<void> {
    await this.client.im.v1.message.patch({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(card)
      }
    });
  }

  async updateProgress(messageId: string, progress: PlatformProgressSnapshot): Promise<void> {
    await this.updateInteractiveCard(messageId, renderFeishuProgressCard(progress));
  }

  async addReaction(messageId: string, emojiType: string): Promise<string | undefined> {
    if (!this.client.im.v1.messageReaction) {
      return undefined;
    }
    const response = await this.client.im.v1.messageReaction.create({
      path: { message_id: messageId },
      data: { reaction_type: { emoji_type: emojiType } }
    });
    return response.data?.reaction_id;
  }

  async removeReaction(messageId: string, reactionId: string): Promise<void> {
    if (!this.client.im.v1.messageReaction) {
      return;
    }
    await this.client.im.v1.messageReaction.delete({
      path: { message_id: messageId, reaction_id: reactionId }
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    if (!this.client.im.v1.message.delete) {
      throw new Error("Feishu message delete API client is not configured");
    }
    await this.client.im.v1.message.delete({ path: { message_id: messageId } });
  }

  async fetchUserName(openId: string): Promise<string | undefined> {
    const contact = this.client.contact as ContactUserGetApi | undefined;
    if (!contact?.v3?.user?.get) {
      return undefined;
    }
    const response = await contact.v3.user.get({
      path: { user_id: openId },
      params: { user_id_type: "open_id" }
    });
    return readNestedString(response, ["data", "user", "name"]) ?? readNestedString(response, ["user", "name"]);
  }

  async fetchUserEmail(openId: string): Promise<string | undefined> {
    const contact = this.client.contact as ContactUserGetApi | undefined;
    if (!contact?.v3?.user?.get) {
      return undefined;
    }
    const response = await contact.v3.user.get({
      path: { user_id: openId },
      params: { user_id_type: "open_id" }
    });
    return readNestedString(response, ["data", "user", "email"]) ?? readNestedString(response, ["user", "email"]);
  }

  async fetchChatName(chatId: string): Promise<string | undefined> {
    const chat = this.client.im.v1.chat as ChatGetApi | undefined;
    if (!chat?.get) {
      return undefined;
    }
    const response = await chat.get({ path: { chat_id: chatId } });
    return readNestedString(response, ["data", "name"]) ?? readNestedString(response, ["name"]);
  }

  async fetchChatMembers(chatId: string): Promise<Array<{ memberId: string; name: string }>> {
    const api = this.client.im.v1.chatMembers as ChatMembersApi | undefined;
    if (!api) {
      return [];
    }
    const params = { member_id_type: "open_id" as const, page_size: 100 };
    if (api.getByIterator) {
      const iter = await api.getByIterator({ path: { chat_id: chatId }, params });
      const members: Array<{ memberId: string; name: string }> = [];
      for await (const raw of iter) {
        const entry = extractChatMember(raw);
        if (entry) {
          members.push(entry);
        }
      }
      return members;
    }
    if (api.list) {
      const members: Array<{ memberId: string; name: string }> = [];
      let pageToken: string | undefined;
      do {
        const response = (await api.list({ path: { chat_id: chatId }, params: { ...params, page_token: pageToken } })) as Record<string, unknown>;
        const items = readNestedArray(response, ["data", "items"]) ?? readNestedArray(response, ["items"]) ?? [];
        for (const item of items) {
          const entry = extractChatMember(item);
          if (entry) {
            members.push(entry);
          }
        }
        const next = readNestedString(response, ["data", "page_token"]) ?? readNestedString(response, ["page_token"]);
        pageToken = next === undefined || next === "" ? undefined : next;
      } while (pageToken);
      return members;
    }
    return [];
  }

  async sendImage(chatId: string, image: Buffer): Promise<string | undefined> {
    if (!this.client.im.v1.image) {
      throw new Error("Feishu image API client is not configured");
    }
    const uploadResponse = await this.client.im.v1.image.create({
      data: { image_type: "message", image }
    });
    const imageKey = extractImageKey(uploadResponse);
    if (!imageKey) {
      throw new Error("Feishu image upload did not return image_key");
    }
    const messageResponse = await this.client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "image" as unknown as "text",
        content: JSON.stringify({ image_key: imageKey })
      }
    });
    return messageResponse.data?.message_id;
  }

  async sendAudio(
    chatId: string,
    audio: Buffer,
    options: { format?: "opus"; fileName?: string } = {}
  ): Promise<string | undefined> {
    const format = options.format ?? "opus";
    if (format !== "opus") {
      throw new Error(`Feishu audio upload only accepts opus (got ${format}); convert before sending`);
    }
    if (!this.client.im.v1.file) {
      throw new Error("Feishu file API client is not configured");
    }
    const uploadResponse = await this.client.im.v1.file.create({
      data: {
        file_name: options.fileName ?? "tts_audio.opus",
        file_type: "opus",
        file: audio
      }
    });
    const fileKey = extractFileKey(uploadResponse);
    if (!fileKey) {
      throw new Error("Feishu audio upload did not return file_key");
    }
    const messageResponse = await this.client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "audio" as unknown as "text",
        content: JSON.stringify({ file_key: fileKey })
      }
    });
    return messageResponse.data?.message_id;
  }

  async downloadResource(
    messageId: string,
    fileKey: string,
    type: "image" | "file"
  ): Promise<Buffer | undefined> {
    if (!this.client.im.v1.messageResource) {
      return undefined;
    }
    const response = await this.client.im.v1.messageResource.get({
      params: { type },
      path: { message_id: messageId, file_key: fileKey }
    });
    if (!response.getReadableStream) {
      return undefined;
    }
    const stream = response.getReadableStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
    }
    return Buffer.concat(chunks);
  }

  async downloadImage(messageId: string, imageKey: string): Promise<{ data: Buffer; mimeType?: string } | undefined> {
    const data = await this.downloadResource(messageId, imageKey, "image");
    if (!data) {
      return undefined;
    }
    return { data, mimeType: detectMimeType(data) };
  }

  async fetchMessage(messageId: string): Promise<FeishuFetchedMessage | undefined> {
    if (!this.client.request) {
      return undefined;
    }
    const response = await this.client.request({
      url: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`,
      method: "GET",
      params: { card_msg_content_type: "raw_card_content" }
    });
    return extractFetchedMessage(response);
  }

  async fetchMergeForwardItems(messageId: string): Promise<FeishuMergeForwardItem[]> {
    if (!this.client.request) {
      return [];
    }
    const response = await this.client.request({
      url: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`,
      method: "GET"
    });
    return extractMergeForwardItems(response);
  }

  private cachedBotOpenId: string | undefined;

  async fetchBotOpenId(): Promise<string | undefined> {
    if (this.cachedBotOpenId !== undefined) {
      return this.cachedBotOpenId;
    }
    if (!this.client.request) {
      throw new Error("Feishu client does not expose a raw request method; cannot resolve bot open_id");
    }
    const response = await this.client.request({ url: "/open-apis/bot/v3/info", method: "GET" });
    const openId = extractBotOpenId(response);
    if (openId === undefined) {
      throw new Error("Feishu bot info response missing open_id");
    }
    this.cachedBotOpenId = openId;
    return openId;
  }

  private async reply(
    messageId: string,
    msgType: "text" | "interactive" | "file",
    content: string
  ): Promise<{ data?: { message_id?: string } }> {
    if (!this.client.im.v1.message.reply) {
      throw new Error("Feishu reply API client is not configured");
    }
    return this.client.im.v1.message.reply({
      path: { message_id: messageId },
      data: { msg_type: msgType, content }
    });
  }
}

function extractFileKey(
  response: { data?: { file_key?: string } } | { file_key?: string } | null
): string | undefined {
  if (response === null) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(response, "data")) {
    return (response as { data?: { file_key?: string } }).data?.file_key;
  }
  return (response as { file_key?: string }).file_key;
}

function extractImageKey(
  response: { data?: { image_key?: string } } | { image_key?: string } | null
): string | undefined {
  if (response === null) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(response, "data")) {
    return (response as { data?: { image_key?: string } }).data?.image_key;
  }
  return (response as { image_key?: string }).image_key;
}

function readNestedString(value: unknown, path: ReadonlyArray<string>): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current !== "" ? current : undefined;
}

function readNestedArray(value: unknown, path: ReadonlyArray<string>): unknown[] | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : undefined;
}

function extractChatMember(raw: unknown): { memberId: string; name: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const memberId = typeof record.member_id === "string" && record.member_id !== "" ? record.member_id : "";
  const name = typeof record.name === "string" && record.name !== "" ? record.name : "";
  if (memberId === "" || name === "") {
    return null;
  }
  return { memberId, name };
}

function extractFetchedMessage(response: unknown): FeishuFetchedMessage | undefined {
  const items = readNestedArray(response, ["data", "items"]) ?? readNestedArray(response, ["items"]);
  if (!items || items.length === 0) {
    return undefined;
  }
  const first = items[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return undefined;
  }
  const record = first as Record<string, unknown>;
  const messageType = typeof record.msg_type === "string" ? record.msg_type : "";
  if (messageType === "") {
    return undefined;
  }
  const body = record.body;
  const content =
    body && typeof body === "object" && !Array.isArray(body) && typeof (body as { content?: unknown }).content === "string"
      ? ((body as { content: string }).content)
      : undefined;
  const sender = record.sender;
  let senderId: string | undefined;
  let senderType: string | undefined;
  if (sender && typeof sender === "object" && !Array.isArray(sender)) {
    const senderRecord = sender as Record<string, unknown>;
    if (typeof senderRecord.id === "string") {
      senderId = senderRecord.id;
    }
    if (typeof senderRecord.sender_type === "string") {
      senderType = senderRecord.sender_type;
    }
  }
  const parentId = typeof record.parent_id === "string" && record.parent_id !== "" ? record.parent_id : undefined;
  const mentionsRaw = Array.isArray(record.mentions) ? record.mentions : [];
  const mentions: FeishuFetchedMessageMention[] = [];
  for (const raw of mentionsRaw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const mention = raw as Record<string, unknown>;
    const key = typeof mention.key === "string" ? mention.key : undefined;
    const name = typeof mention.name === "string" ? mention.name : undefined;
    if (key === undefined && name === undefined) {
      continue;
    }
    mentions.push({ key, name });
  }
  return { messageType, parentId, senderId, senderType, content, mentions };
}

function extractMergeForwardItems(response: unknown): FeishuMergeForwardItem[] {
  const items = readNestedArray(response, ["data", "items"]) ?? readNestedArray(response, ["items"]);
  if (!items) {
    return [];
  }
  const result: FeishuMergeForwardItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const record = raw as Record<string, unknown>;
    const messageId = typeof record.message_id === "string" ? record.message_id : "";
    const messageType = typeof record.msg_type === "string" ? record.msg_type : "";
    if (messageId === "" || messageType === "") {
      continue;
    }
    const upper = typeof record.upper_message_id === "string" && record.upper_message_id !== ""
      ? record.upper_message_id
      : undefined;
    let senderId: string | undefined;
    let senderType: string | undefined;
    if (record.sender && typeof record.sender === "object" && !Array.isArray(record.sender)) {
      const sender = record.sender as Record<string, unknown>;
      if (typeof sender.id === "string") {
        senderId = sender.id;
      }
      if (typeof sender.sender_type === "string") {
        senderType = sender.sender_type;
      }
    }
    const body = record.body;
    const content = body && typeof body === "object" && !Array.isArray(body) && typeof (body as { content?: unknown }).content === "string"
      ? ((body as { content: string }).content)
      : undefined;
    const createTimeMs = typeof record.create_time === "string" && record.create_time !== ""
      ? Number(record.create_time)
      : undefined;
    const mentionsRaw = Array.isArray(record.mentions) ? record.mentions : [];
    const mentions: FeishuFetchedMessageMention[] = [];
    for (const m of mentionsRaw) {
      if (!m || typeof m !== "object" || Array.isArray(m)) {
        continue;
      }
      const mention = m as Record<string, unknown>;
      const key = typeof mention.key === "string" ? mention.key : undefined;
      const name = typeof mention.name === "string" ? mention.name : undefined;
      if (key === undefined && name === undefined) {
        continue;
      }
      mentions.push({ key, name });
    }
    result.push({
      messageId,
      messageType,
      upperMessageId: upper,
      senderId,
      senderType,
      createTimeMs: createTimeMs === undefined || Number.isNaN(createTimeMs) ? undefined : createTimeMs,
      content,
      mentions
    });
  }
  return result;
}

function extractBotOpenId(response: unknown): string | undefined {
  if (!response || typeof response !== "object") {
    return undefined;
  }
  const direct = (response as { bot?: { open_id?: unknown } }).bot;
  if (direct && typeof direct === "object" && typeof direct.open_id === "string" && direct.open_id !== "") {
    return direct.open_id;
  }
  const nested = (response as { data?: { bot?: { open_id?: unknown } } }).data?.bot;
  if (nested && typeof nested === "object" && typeof nested.open_id === "string" && nested.open_id !== "") {
    return nested.open_id;
  }
  return undefined;
}
