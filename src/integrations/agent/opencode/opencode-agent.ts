import type { Agent, AgentSession, AgentSessionOptions } from "../agent-session.js";
import { CliAgent } from "../stream-cli-agent.js";
import { OpencodeStreamParser } from "./opencode-stream-parser.js";

export interface OpencodeAgentConfig {
  command: string;
  /** Prefix args before the opencode subcommand (mainly for tests, e.g. node -e). */
  args?: ReadonlyArray<string>;
  model?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

/** Builds the `opencode run` argv. Always headless json + yolo (no permission prompts). */
export function buildOpencodeArgs(opts: {
  model?: string;
  resumeSessionId?: string;
}): string[] {
  const args = ["run", "--format", "json", "--dangerously-skip-permissions"];
  if (opts.model) args.push("--model", opts.model);
  if (opts.resumeSessionId) args.push("--session", opts.resumeSessionId);
  return args;
}

/** Drives the OpenCode CLI; one rich NDJSON-parsing channel. */
export class OpencodeAgent implements Agent {
  private readonly inner: CliAgent;

  constructor(config: OpencodeAgentConfig) {
    this.inner = new CliAgent({
      command: config.command,
      args: config.args,
      env: config.env,
      timeoutMs: config.timeoutMs,
      buildArgs: (ctx) =>
        buildOpencodeArgs({ model: config.model, resumeSessionId: ctx.resumeSessionId }),
      createParser: () => new OpencodeStreamParser()
    });
  }

  startSession(options?: AgentSessionOptions): AgentSession {
    return this.inner.startSession(options);
  }
}
