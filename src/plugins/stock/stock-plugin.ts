import type { FeeglePlugin } from "../../infra/boot/feegle-plugin.js";
import {
  stockAdvisorKindModule,
  stockMonitorKindModule,
  stockPortfolioSnapshotKindModule
} from "../../features/scheduler/default-handler-kind-modules.js";
import { defaultQuoteClientModules } from "../../integrations/stock/default-quote-client-modules.js";

export const stockPlugin: FeeglePlugin = {
  id: "stock",
  quoteClients: defaultQuoteClientModules(),
  handlerKinds: [stockMonitorKindModule(), stockPortfolioSnapshotKindModule(), stockAdvisorKindModule()]
};
