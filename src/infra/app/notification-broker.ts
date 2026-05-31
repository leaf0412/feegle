import type { NotificationPort, NotificationTarget } from "./notification-port.js";

export class NotificationBroker implements NotificationPort {
  private frozen = false;

  constructor(
    private readonly adapters: Record<string, NotificationPort> = {}
  ) {}

  register(platform: string, adapter: NotificationPort): this {
    if (this.frozen) {
      throw new Error("Notification broker is frozen; register all adapters before boot completes");
    }
    if (this.adapters[platform]) {
      throw new Error(`Notification adapter already registered for platform: ${platform}`);
    }
    this.adapters[platform] = adapter;
    return this;
  }

  freeze(): this {
    this.frozen = true;
    return this;
  }

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
