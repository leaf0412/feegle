import type { NotificationPort, NotificationTarget } from "@infra/app/notification-port.js";
import type { PlatformCard } from "@platform/platform-card.js";
import { renderFeishuCard } from "./feishu-card-renderer.js";
import type { FeishuClientPort } from "./feishu-client.js";

export class FeishuNotificationAdapter implements NotificationPort {
  constructor(private readonly client: FeishuClientPort) {}

  async sendText(target: NotificationTarget, text: string): Promise<void> {
    await this.client.sendText(target.chatId, text);
  }

  async sendCard(target: NotificationTarget, card: PlatformCard): Promise<void> {
    await this.client.sendInteractiveCard(target.chatId, renderFeishuCard(card));
  }
}
