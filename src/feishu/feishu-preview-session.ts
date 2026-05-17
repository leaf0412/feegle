import type { FeishuClientPort } from "./feishu-client.js";
import {
  buildCardJSONWithStatus,
  isCardJSON,
  type FeishuRichCardStatus
} from "./feishu-rich-card.js";
import { preprocessFeishuMarkdown } from "./feishu-markdown.js";
import { buildCardJSON } from "./feishu-mime.js";

export interface FeishuPreviewStartOptions {
  /** When provided, the preview will be sent as a reply to this message id. */
  replyToMessageId?: string;
}

export interface FeishuPreviewFinishOptions {
  finalContent?: string;
  keepOnFinish?: boolean;
}

export class FeishuPreviewSession {
  private messageId: string | undefined;
  private currentStatus: FeishuRichCardStatus = "working";

  constructor(private readonly client: FeishuClientPort, private readonly chatId: string) {}

  get currentMessageId(): string | undefined {
    return this.messageId;
  }

  async start(content: string, options: FeishuPreviewStartOptions = {}): Promise<string | undefined> {
    if (this.messageId !== undefined) {
      throw new Error("Feishu preview session already started; call update() or finish() instead");
    }
    const card = serialize(content);
    const messageId = options.replyToMessageId !== undefined
      ? await this.client.replyInteractiveCard(options.replyToMessageId, card)
      : await this.client.sendInteractiveCard(this.chatId, card);
    if (messageId === undefined) {
      throw new Error("Feishu preview start did not return a message id");
    }
    this.messageId = messageId;
    return messageId;
  }

  async update(content: string): Promise<void> {
    if (this.messageId === undefined) {
      throw new Error("Feishu preview session not started");
    }
    await this.client.updateInteractiveCard(this.messageId, serialize(content));
  }

  async setStatus(status: FeishuRichCardStatus, content: string): Promise<void> {
    if (this.messageId === undefined) {
      throw new Error("Feishu preview session not started");
    }
    this.currentStatus = status;
    const card = isCardJSON(content) ? content : buildCardJSONWithStatus(content, status);
    await this.client.updateInteractiveCard(this.messageId, JSON.parse(card));
  }

  async finish(options: FeishuPreviewFinishOptions = {}): Promise<void> {
    if (this.messageId === undefined) {
      return;
    }
    const finalContent = options.finalContent;
    if (options.keepOnFinish === false || (options.keepOnFinish === undefined && finalContent === undefined)) {
      await this.client.deleteMessage(this.messageId);
      this.messageId = undefined;
      return;
    }
    if (finalContent !== undefined) {
      await this.client.updateInteractiveCard(this.messageId, serialize(finalContent));
    }
  }

  get status(): FeishuRichCardStatus {
    return this.currentStatus;
  }
}

function serialize(content: string): unknown {
  if (isCardJSON(content)) {
    return JSON.parse(content);
  }
  return JSON.parse(buildCardJSON(preprocessFeishuMarkdown(content)));
}
