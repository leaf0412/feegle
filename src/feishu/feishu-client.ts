import { createReadStream } from "node:fs";
import type { ReadStream } from "node:fs";
import { basename } from "node:path";
import type { PlatformProgressSnapshot } from "../platform/progress.js";
import { renderFeishuProgressCard } from "./feishu-progress-card.js";

export interface FeishuRawRequest {
  url: string;
  method: string;
  data?: unknown;
  params?: Record<string, string | number | undefined>;
}

export interface FeishuOpenApiClient {
  request?(payload: FeishuRawRequest): Promise<unknown>;
  im: {
    v1: {
      file?: {
        create(input: {
          data: {
            file_name: string;
            file_type: "stream";
            file: ReadStream;
          };
        }): Promise<{ data?: { file_key?: string } } | { file_key?: string } | null>;
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
    };
  };
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
  fetchBotOpenId(): Promise<string | undefined>;
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
