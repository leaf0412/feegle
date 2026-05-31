import { DirectCliAdapter } from "./direct-cli-adapter.js";
import type { AgentCli } from "./agent-cli.js";
import type { ProviderRecord } from "./provider-store.js";

/**
 * Every provider record runs a CLI directly in non-interactive mode (codex
 * exec, claude -p). `record.kind` is a free-form user label, not a dispatch
 * discriminator. `command`/`args`/`env`/`timeoutMs` are first-class optional
 * fields; the prompt is fed on stdin and the answer read from stdout. Extra
 * adapter-specific keys pass through but are not used here.
 *
 * When `record.secretRef` is set (e.g. "secret/openai-api-key"), the ref is
 * resolved to an environment variable and merged into the adapter's env —
 * using the same naming convention as resolveGitLabToken (ref suffix →
 * UPPER_SNAKE_CASE env var name).
 */
export function buildProviderAdapter(record: ProviderRecord): AgentCli {
  const env = { ...(record.env ?? {}) };
  if (record.secretRef) {
    const suffix = record.secretRef.split("/").pop() ?? "";
    const envName = suffix.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const resolved = process.env[envName];
    if (resolved) {
      env[envName] = resolved;
    }
  }
  return new DirectCliAdapter({
    command: record.command ?? record.kind,
    args: record.args,
    env: Object.keys(env).length > 0 ? env : undefined,
    timeoutMs: record.timeoutMs
  });
}

/**
 * The user's chosen `kind` label IS the display name.
 */
export function defaultProviderDisplayName(kind: string): string {
  return kind;
}
