import type { Agent } from "./agent-session.js";
import type { ProviderRecord } from "./provider-store.js";
import { OpencodeAgent } from "./opencode/opencode-agent.js";
import { CodexAgent } from "./codex/codex-agent.js";
import { ClaudeCodeAgent } from "./claude-code/claude-code-agent.js";

/**
 * Builds the right rich-streaming {@link Agent} for a provider record, chosen by
 * its `protocol` discriminator. There is no default and no text-only fallback:
 * a missing or unknown protocol throws — every provider must declare which CLI
 * it drives. See `_docs/specs/2026-06-01-agent-event-stream-design.md`.
 *
 * `secretRef` is resolved to an environment variable (ref suffix →
 * UPPER_SNAKE_CASE) and merged into the agent's env, matching the prior factory.
 */
export function buildAgent(record: ProviderRecord): Agent {
  const config = {
    command: record.command ?? record.kind,
    args: record.args,
    model: record.model,
    env: resolveEnv(record),
    timeoutMs: record.timeoutMs
  };

  switch (record.protocol) {
    case "opencode":
      return new OpencodeAgent(config);
    case "codex":
      return new CodexAgent(config);
    case "claudecode":
      return new ClaudeCodeAgent(config);
    default:
      throw new Error(
        `provider "${record.kind}" has no known agent protocol (got ${JSON.stringify(
          record.protocol
        )}); set protocol to "opencode", "codex" or "claudecode"`
      );
  }
}

function resolveEnv(record: ProviderRecord): Record<string, string> | undefined {
  const env = { ...(record.env ?? {}) };
  if (record.secretRef) {
    const suffix = record.secretRef.split("/").pop() ?? "";
    const envName = suffix.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const resolved = process.env[envName];
    if (resolved) env[envName] = resolved;
  }
  return Object.keys(env).length > 0 ? env : undefined;
}
