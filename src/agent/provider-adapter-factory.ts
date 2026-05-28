import { AcpAgentAdapter } from "./acp-agent-adapter.js";
import type { AgentCli } from "./agent-cli.js";
import type { ProviderRecord } from "./provider-store.js";

/**
 * Every provider record runs through ACP. `record.kind` is a free-form user
 * label, not a dispatch discriminator. The schema now exposes `command`,
 * `args`, `env`, and `timeoutMs` as first-class optional fields; extra
 * adapter-specific keys pass through but are not used here.
 */
export function buildProviderAdapter(record: ProviderRecord): AgentCli {
  return new AcpAgentAdapter({
    command: record.command ?? record.kind,
    args: record.args,
    env: record.env,
    timeoutMs: record.timeoutMs
  });
}

/**
 * The user's chosen `kind` label IS the display name. A future improvement
 * could enrich this by reading `agentInfo.title` from the ACP `initialize`
 * response, but that requires spawning the agent — defer.
 */
export function defaultProviderDisplayName(kind: string): string {
  return kind;
}
