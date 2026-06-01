import type { Agent, AgentSession, AgentSessionOptions } from "../agent-session.js";
import { CliAgent } from "../stream-cli-agent.js";
import { ClaudeCodeStreamParser } from "./claude-code-stream-parser.js";

export interface ClaudeCodeAgentConfig {
  command: string;
  /** Prefix args before the claude flags (mainly for tests, e.g. node -e). */
  args?: ReadonlyArray<string>;
  model?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

/**
 * Builds the `claude -p --output-format stream-json` argv. Print mode reads the
 * prompt as text from stdin (simpler than `--input-format stream-json`, which
 * needs a JSON envelope); `--verbose` is required for stream-json output;
 * `--dangerously-skip-permissions` runs yolo (no permission prompts), replacing
 * cc-connect's `--permission-prompt-tool stdio`.
 */
export function buildClaudeCodeArgs(opts: {
  model?: string;
  resumeSessionId?: string;
}): string[] {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions"
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
  return args;
}

/** Drives the Claude Code CLI; one rich stream-json channel. */
export class ClaudeCodeAgent implements Agent {
  private readonly inner: CliAgent;

  constructor(config: ClaudeCodeAgentConfig) {
    this.inner = new CliAgent({
      command: config.command,
      args: config.args,
      env: config.env,
      timeoutMs: config.timeoutMs,
      buildArgs: (ctx) =>
        buildClaudeCodeArgs({ model: config.model, resumeSessionId: ctx.resumeSessionId }),
      createParser: () => new ClaudeCodeStreamParser()
    });
  }

  startSession(options?: AgentSessionOptions): AgentSession {
    return this.inner.startSession(options);
  }
}
