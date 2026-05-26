import type { BootContext } from "./boot-context.js";
import type { AgentProviderRegistry } from "../agent/agent-provider-registry.js";
import { buildAgentProviderRegistry } from "../agent/build-agent-provider-registry.js";
import type { ConfigStorePort } from "../app/config-store.js";
import type { ProvidersFile, ProviderStorePort } from "../agent/provider-store.js";

export class EmptyProviderStoreReadView implements ProviderStorePort {
  snapshot(): Readonly<ProvidersFile> {
    return { schemaVersion: 1, providers: [], activeKind: null };
  }
  async setActive(_kind: ProvidersFile["activeKind"]): Promise<void> {}
  async upsert(): Promise<void> {
    throw new Error("provider register is disabled when agent providers are configured in config.jsonc");
  }
  async updateSettings(): Promise<never> {
    throw new Error("provider settings are disabled when agent providers are configured in config.jsonc");
  }
  async remove(): Promise<never> {
    throw new Error("provider unregister is disabled when agent providers are configured in config.jsonc");
  }
}

export function requireAgentConfig(
  config: Readonly<ReturnType<ConfigStorePort["get"]>>
): NonNullable<ReturnType<ConfigStorePort["get"]>["agent"]> {
  if (!config.agent) {
    throw new Error("agent config is required. Add ~/.feegle/config.jsonc with agent.default and agent.providers.");
  }
  return config.agent;
}

export interface ResolveAgentsDeps {
  feegleHome: string;
  agentProviders?: AgentProviderRegistry;
  loadAgentProviders?: (feegleHome: string) => Promise<AgentProviderRegistry>;
}

export function makeResolveAgents(deps: ResolveAgentsDeps) {
  return async (ctx: BootContext): Promise<AgentProviderRegistry> => {
    if (deps.agentProviders) {
      return deps.agentProviders;
    }
    if (deps.loadAgentProviders) {
      return deps.loadAgentProviders(deps.feegleHome);
    }
    return buildAgentProviderRegistry({
      store: new EmptyProviderStoreReadView(),
      config: requireAgentConfig(ctx.require("configStore").get())
    });
  };
}
