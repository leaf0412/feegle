import type { BootContext } from "./boot-context.js";
import type { AgentProviderRegistry } from "../../agent/agent-provider-registry.js";
import { buildAgentProviderRegistry } from "../../agent/build-agent-provider-registry.js";
import type { ConfigStorePort } from "../app/config-store.js";

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
    // Single source of truth: ProviderStore IS a view over ConfigStore.agent.providers.
    // No dual-path fork — if config.jsonc lacks an agent block, requireAgentConfig throws.
    requireAgentConfig(ctx.require("configStore").get());
    return buildAgentProviderRegistry({ store: ctx.require("providerStore") });
  };
}
