import { AcpAgentAdapter } from "./acp-agent-adapter.js";
import type { AgentCli } from "./agent-cli.js";
import type { ProviderRecord } from "./provider-store.js";

/**
 * Every provider record runs through ACP. `record.kind` is a free-form user
 * label, not a dispatch discriminator. The fields read below — `command`,
 * `args`, `env`, `timeoutMs` — become first-class on the record schema in the
 * next task; the cast here lets this commit compile while the schema is still
 * a discriminated union.
 */
export function buildProviderAdapter(record: ProviderRecord): AgentCli {
  const generic = record as unknown as {
    kind: string;
    command?: string;
    args?: ReadonlyArray<string>;
    env?: Readonly<Record<string, string>>;
    timeoutMs?: number;
  };
  return new AcpAgentAdapter({
    command: generic.command ?? generic.kind,
    args: generic.args,
    env: generic.env,
    timeoutMs: generic.timeoutMs
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
