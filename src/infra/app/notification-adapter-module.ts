import type { FeishuClientPort } from "../../feishu/feishu-client.js";
import type { NotificationBroker } from "./notification-broker.js";

export interface NotificationAdapterDeps {
  feishuClient: FeishuClientPort;
}

export interface NotificationAdapterModule {
  readonly id: string;
  register(broker: NotificationBroker, deps: NotificationAdapterDeps): void;
}
