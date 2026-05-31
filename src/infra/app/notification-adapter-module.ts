import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import type { NotificationBroker } from "./notification-broker.js";

export interface NotificationAdapterDeps {
  feishuClient: FeishuClientPort;
}

export interface NotificationAdapterModule {
  readonly id: string;
  register(broker: NotificationBroker, deps: NotificationAdapterDeps): void;
}
