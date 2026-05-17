export interface FeishuOpenApiClient {
  im: {
    message: {
      create(input: {
        params: { receive_id_type: "chat_id" };
        data: {
          receive_id: string;
          msg_type: "text" | "interactive";
          content: string;
        };
      }): Promise<unknown>;
    };
  };
}

export interface FeishuClientPort {
  sendText(chatId: string, text: string): Promise<void>;
  sendInteractiveCard(chatId: string, card: unknown): Promise<void>;
}

export class LarkFeishuClient implements FeishuClientPort {
  constructor(private readonly client: FeishuOpenApiClient) {}

  async sendText(chatId: string, text: string): Promise<void> {
    await this.client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text })
      }
    });
  }

  async sendInteractiveCard(chatId: string, card: unknown): Promise<void> {
    await this.client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "interactive",
        content: JSON.stringify(card)
      }
    });
  }
}
