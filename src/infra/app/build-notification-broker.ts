import { FeishuNotificationAdapter } from "@integrations/feishu/feishu-notification-adapter.js";
import { NotificationBroker } from "./notification-broker.js";
import type { NotificationAdapterDeps, NotificationAdapterModule } from "./notification-adapter-module.js";

export interface BuildNotificationBrokerOptions extends NotificationAdapterDeps {
  modules: readonly NotificationAdapterModule[];
}

export function buildNotificationBroker(options: BuildNotificationBrokerOptions): NotificationBroker {
  const broker = new NotificationBroker();
  for (const module of options.modules) {
    module.register(broker, options);
  }
  broker.freeze();
  return broker;
}

export function feishuNotificationAdapterModule(): NotificationAdapterModule {
  return {
    id: "feishu",
    register: (broker, deps) => {
      broker.register("feishu", new FeishuNotificationAdapter(deps.feishuClient));
    }
  };
}
