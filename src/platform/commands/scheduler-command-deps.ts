import type { ConfigStorePort } from "../../app/config-store.js";
import type { HandlerKindRegistry } from "../../scheduler/handler-kind-registry.js";
import type { RunsLog } from "../../scheduler/runs-log.js";
import type { TaskScheduler } from "../../scheduler/task-scheduler.js";
import type { TaskRegistry } from "../../scheduler/task-registry.js";
import type { QuoteClient } from "../../stock/stock-quote-port.js";
import type { StockStore } from "../../stock/stock-store.js";

export interface SchedulerCommandDeps {
  ownerIdentities: ReadonlySet<string>;
  taskRegistry: TaskRegistry;
  configStore: ConfigStorePort;
  stockStore: StockStore;
  quote: QuoteClient;
  kinds: HandlerKindRegistry;
  scheduler: TaskScheduler;
  runsLog?: Pick<RunsLog, "tailReverse">;
}
