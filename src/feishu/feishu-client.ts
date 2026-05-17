export interface FeishuOpenApiClient {
  im: {
    v1: {
      message: {
        create(input: {
          params: { receive_id_type: "chat_id" };
          data: {
            receive_id: string;
            msg_type: "text" | "interactive";
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

  async updateInteractiveCard(messageId: string, card: unknown): Promise<void> {
    await this.client.im.v1.message.patch({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(card)
      }
    });
  }
}
