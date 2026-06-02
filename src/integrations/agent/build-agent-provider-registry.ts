import { AgentProviderRegistry } from "./agent-provider-registry.js";
import type { Agent } from "./agent-session.js";
import { buildAgent } from "./build-agent.js";
import type { ProviderRecord, ProvidersFile } from "./provider-store.js";

function defaultProviderDisplayName(kind: string): string {
  return kind;
}

export interface ProviderStoreReadView {
  snapshot(): Readonly<ProvidersFile>;
  setActive(kind: ProvidersFile["activeKind"]): Promise<void>;
}

export interface BuildAgentProviderRegistryOptions {
  store: ProviderStoreReadView;
  adapterFactory?: (record: ProviderRecord) => Agent;
}

export function buildAgentProviderRegistry(
  options: BuildAgentProviderRegistryOptions
): AgentProviderRegistry {
  const { store, adapterFactory = buildAgent } = options;
  const file = store.snapshot();
  const registry = new AgentProviderRegistry();
  for (const record of file.providers) {
    registry.register({
      kind: record.kind,
      displayName: defaultProviderDisplayName(record.kind),
      buildAgent: () => adapterFactory(record)
    });
  }
  if (file.activeKind !== null) {
    if (registry.available().some((provider) => provider.kind === file.activeKind)) {
      registry.setActive(file.activeKind);
    } else {
      console.warn(`Persisted activeKind ${file.activeKind} is not in the registry; clearing it.`);
      void store.setActive(null);
    }
  }
  return registry;
}
