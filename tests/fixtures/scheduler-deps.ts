import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import type { ProviderStore } from "../../src/agent/provider-store.js";
import type { ConfigStorePort } from "../../src/app/config-store.js";
import { HandlerKindRegistry } from "../../src/scheduler/handler-kind-registry.js";
import type { TaskRegistry } from "../../src/scheduler/task-registry.js";
import type { TaskScheduler } from "../../src/scheduler/task-scheduler.js";
import type { QuoteClient } from "../../src/stock/stock-quote-port.js";
import type { StockStore } from "../../src/stock/stock-store.js";
import type { SlashCommandRegistryDeps } from "../../src/platform/slash-command-module.js";

/**
 * Minimal scheduler deps that satisfy `requireSchedulerDeps` so tests focused on
 * catalog content / dispatch wiring can drive `buildSlashCommandRegistry` without
 * standing up real stores. Handlers store these in their constructor but never
 * execute methods on them in catalog-level assertions.
 */
export function stubSchedulerSlashDeps(overrides: Partial<SlashCommandRegistryDeps> = {}): SlashCommandRegistryDeps {
  return {
    repositories: { list: () => [] },
    ownerEmails: new Set<string>(),
    taskRegistry: {} as TaskRegistry,
    configStore: {
      get: () => ({ schemaVersion: 1, failureTarget: null }),
      setFailureTarget: async () => {}
    } as ConfigStorePort,
    stockStore: {} as StockStore,
    quote: { query: async () => [] } as QuoteClient,
    kinds: new HandlerKindRegistry(),
    scheduler: {} as TaskScheduler,
    providers: new AgentProviderRegistry(),
    providerStore: {} as ProviderStore,
    ...overrides
  };
}
