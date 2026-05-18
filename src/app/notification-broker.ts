import type { NotificationPort, NotificationTarget } from "./notification-port.js";

export class NotificationBroker implements NotificationPort {
  constructor(
    private readonly adapters: Partial<Record<NotificationTarget["platform"], NotificationPort>>
  ) {}

  async sendText(target: NotificationTarget, text: string): Promise<void> {
    await this.resolve(target).sendText(target, text);
  }

  async sendCard(target: NotificationTarget, card: Parameters<NotificationPort["sendCard"]>[1]): Promise<void> {
    await this.resolve(target).sendCard(target, card);
  }

  private resolve(target: NotificationTarget): NotificationPort {
    const adapter = this.adapters[target.platform];
    if (!adapter) {
      throw new Error(`No notification adapter registered for platform: ${target.platform}`);
    }
    return adapter;
  }
}
