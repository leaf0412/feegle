import { AgentProviderRegistry } from "./agent-provider-registry.js";
import {
  buildProviderAdapter,
  defaultProviderDisplayName
} from "./provider-adapter-factory.js";
import type { FeegleConfig } from "../app/config-store.js";
import { ProviderRecordSchema, type ProviderRecord, type ProvidersFile } from "./provider-store.js";

export interface ProviderStoreReadView {
  snapshot(): Readonly<ProvidersFile>;
  setActive(kind: ProvidersFile["activeKind"]): Promise<void>;
}

export interface BuildAgentProviderRegistryOptions {
  store: ProviderStoreReadView;
  config?: FeegleConfig["agent"];
  adapterFactory?: (record: ProviderRecord) => ReturnType<typeof buildProviderAdapter>;
}

export function buildAgentProviderRegistry(
  options: BuildAgentProviderRegistryOptions
): AgentProviderRegistry {
  const { store, adapterFactory = buildProviderAdapter } = options;
  const file = store.snapshot();
  const records = options.config ? providerRecordsFromConfig(options.config) : file.providers;
  const activeKind = options.config ? options.config.default : file.activeKind;
  const registry = new AgentProviderRegistry();
  for (const record of records) {
    registry.register({
      kind: record.kind,
      displayName: defaultProviderDisplayName(record.kind),
      buildAgent: () => adapterFactory(record)
    });
  }
  if (activeKind !== null) {
    if (registry.available().some((provider) => provider.kind === activeKind)) {
      registry.setActive(activeKind);
    } else {
      if (options.config) {
        throw new Error(`agent.default provider not configured: ${activeKind}`);
      }
      console.warn(`Persisted activeKind ${activeKind} is not in the registry; clearing it.`);
      void store.setActive(null);
    }
  }
  return registry;
}

function providerRecordsFromConfig(config: NonNullable<FeegleConfig["agent"]>): ProviderRecord[] {
  return Object.entries(config.providers).map(([kind, provider]) =>
    ProviderRecordSchema.parse({ kind, ...provider })
  );
}
