import type { PlatformCard } from "../platform/platform-card.js";

export interface NotificationTarget {
  platform: "feishu";
  chatId: string;
}

export interface NotificationPort {
  sendText(target: NotificationTarget, text: string): Promise<void>;
  sendCard(target: NotificationTarget, card: PlatformCard): Promise<void>;
}
