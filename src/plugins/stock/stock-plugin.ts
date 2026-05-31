import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import {
  stockAdvisorKindModule,
  stockMonitorKindModule,
  stockPortfolioSnapshotKindModule
} from "@features/scheduler/default-handler-kind-modules.js";
import { defaultQuoteClientModules } from "@integrations/stock/default-quote-client-modules.js";

export const stockPlugin: FeeglePlugin = {
  id: "stock",
  manifest: {
    id: "stock",
    version: "1.0.0",
    displayName: "Stock Monitoring",
    description: "Stock quote retrieval, monitoring, advisory, and portfolio snapshot",
    triggerTypes: ["cron"],
    effectTypes: [
      { pluginId: "stock", effectType: "fetch_quote" },
      { pluginId: "stock", effectType: "monitor_price" }
    ],
    permissions: ["read_stock_data", "schedule_monitoring"]
  },
  quoteClients: defaultQuoteClientModules(),
  handlerKinds: [stockMonitorKindModule(), stockPortfolioSnapshotKindModule(), stockAdvisorKindModule()]
};
