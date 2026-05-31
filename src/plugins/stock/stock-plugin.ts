import type { FeeglePlugin } from "../../boot/feegle-plugin.js";
import {
  stockAdvisorKindModule,
  stockMonitorKindModule,
  stockPortfolioSnapshotKindModule
} from "../../scheduler/default-handler-kind-modules.js";
import { defaultQuoteClientModules } from "../../integrations/stock/default-quote-client-modules.js";

export const stockPlugin: FeeglePlugin = {
  id: "stock",
  quoteClients: defaultQuoteClientModules(),
  handlerKinds: [stockMonitorKindModule(), stockPortfolioSnapshotKindModule(), stockAdvisorKindModule()]
};
