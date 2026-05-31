import type { ConfigStorePort } from "../../infra/app/config-store.js";
import type { HandlerKindRegistry } from "../../features/scheduler/handler-kind-registry.js";
import type { RunsLog } from "../../features/scheduler/runs-log.js";
import type { TaskScheduler } from "../../features/scheduler/task-scheduler.js";
import type { TaskRegistry } from "../../features/scheduler/task-registry.js";
import type { QuoteClient } from "../../integrations/stock/stock-quote-port.js";
import type { StockStore } from "../../integrations/stock/stock-store.js";

export interface SchedulerCommandDeps {
  ownerEmails: ReadonlySet<string>;
  taskRegistry: TaskRegistry;
  configStore: ConfigStorePort;
  stockStore: StockStore;
  quote: QuoteClient;
  kinds: HandlerKindRegistry;
  scheduler: TaskScheduler;
  runsLog?: Pick<RunsLog, "tailReverse">;
}
