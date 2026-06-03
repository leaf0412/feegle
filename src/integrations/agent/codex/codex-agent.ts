import type { Agent, AgentSession, AgentSessionOptions } from "../agent-session.js";
import { CliAgent } from "../stream-cli-agent.js";
import { CodexStreamParser } from "./codex-stream-parser.js";

export interface CodexAgentConfig {
  command: string;
  /** Prefix args before the codex subcommand (mainly for tests, e.g. node -e). */
  args?: ReadonlyArray<string>;
  model?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

/**
 * Builds the `codex exec --json` argv. Always yolo (bypass approvals/sandbox —
 * no permission prompts); prompt is read from stdin via the trailing `-`.
 */
export function buildCodexArgs(opts: { model?: string; resumeSessionId?: string }): string[] {
  const resume = Boolean(opts.resumeSessionId);
  const args = resume
    ? ["exec", "resume", "--skip-git-repo-check"]
    : ["exec", "--skip-git-repo-check"];
  args.push("--dangerously-bypass-approvals-and-sandbox");
  if (opts.model) args.push("--model", opts.model);
  if (resume) args.push(opts.resumeSessionId as string);
  args.push("--json", "-");
  return args;
}

/** Drives the OpenAI Codex CLI; one rich `codex exec --json` channel. */
export class CodexAgent implements Agent {
  private readonly inner: CliAgent;

  constructor(config: CodexAgentConfig) {
    this.inner = new CliAgent({
      command: config.command,
      args: config.args,
      env: config.env,
      timeoutMs: config.timeoutMs,
      buildArgs: (ctx) =>
        buildCodexArgs({ model: config.model, resumeSessionId: ctx.resumeSessionId }),
      createParser: () => new CodexStreamParser()
    });
  }

  startSession(options?: AgentSessionOptions): AgentSession {
    return this.inner.startSession(options);
  }
}
