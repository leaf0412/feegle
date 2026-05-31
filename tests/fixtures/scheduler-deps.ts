import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import type { ProviderStore } from "../../src/agent/provider-store.js";
import type { ConfigStorePort } from "@infra/app/config-store.js";
import { HandlerKindRegistry } from "@features/scheduler/handler-kind-registry.js";
import type { TaskRegistry } from "@features/scheduler/task-registry.js";
import type { TaskScheduler } from "@features/scheduler/task-scheduler.js";
import type { QuoteClient } from "@integrations/stock/stock-quote-port.js";
import type { StockStore } from "@integrations/stock/stock-store.js";
import type { SlashCommandRegistryDeps } from "@platform/slash-command-module.js";

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
