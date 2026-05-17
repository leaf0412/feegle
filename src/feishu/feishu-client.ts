import { createReadStream } from "node:fs";
import type { ReadStream } from "node:fs";
import { basename } from "node:path";

export interface FeishuOpenApiClient {
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
      };
    };
  };
}

export interface FeishuClientPort {
  sendText(chatId: string, text: string): Promise<string | undefined>;
  sendInteractiveCard(chatId: string, card: unknown): Promise<string | undefined>;
  sendFile(chatId: string, filePath: string): Promise<string | undefined>;
  updateInteractiveCard(messageId: string, card: unknown): Promise<void>;
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
