import { DirectCliAdapter } from "./direct-cli-adapter.js";
import type { AgentCli } from "./agent-cli.js";
import type { ProviderRecord } from "./provider-store.js";

/**
 * Every provider record runs a CLI directly in non-interactive mode (codex
 * exec, claude -p). `record.kind` is a free-form user label, not a dispatch
 * discriminator. `command`/`args`/`env`/`timeoutMs` are first-class optional
 * fields; the prompt is fed on stdin and the answer read from stdout. Extra
 * adapter-specific keys pass through but are not used here.
 */
export function buildProviderAdapter(record: ProviderRecord): AgentCli {
  return new DirectCliAdapter({
    command: record.command ?? record.kind,
    args: record.args,
    env: record.env,
    timeoutMs: record.timeoutMs
  });
}

/**
 * The user's chosen `kind` label IS the display name.
 */
export function defaultProviderDisplayName(kind: string): string {
  return kind;
}
