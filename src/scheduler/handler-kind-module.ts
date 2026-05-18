import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import type { QuoteClient } from "../stock/stock-quote-port.js";
import type { StockStore } from "../stock/stock-store.js";
import type { HandlerKindRegistry } from "./handler-kind-registry.js";
import type { TaskRegistry } from "./task-registry.js";

export interface HandlerKindRegistryDeps {
  taskRegistry: TaskRegistry;
  stockStore: StockStore;
  quote: QuoteClient;
  agents: AgentProviderRegistry;
}

export interface HandlerKindModule {
  readonly id: string;
  register(registry: HandlerKindRegistry, deps: HandlerKindRegistryDeps): void;
}
