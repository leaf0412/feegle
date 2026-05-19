import "./codex-agent-adapter.js";
import "./claude-code-agent-adapter.js";

import { type AgentCli } from "./agent-cli.js";
import { createAgent, agentDisplayName } from "./agent-registry.js";
import type { ProviderRecord } from "./provider-store.js";

export function buildProviderAdapter(record: ProviderRecord): AgentCli {
  return createAgent(record.kind, record);
}

export function defaultProviderDisplayName(kind: ProviderRecord["kind"]): string {
  return agentDisplayName(kind);
}
