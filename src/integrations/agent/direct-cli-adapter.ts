import { spawn } from "node:child_process";
import type {
  AgentChatMessage,
  AgentCli,
  AgentRepositoryContext,
  AgentRequirementContext,
  AgentRunOptions,
  DevelopmentTaskResult,
  PlanGenerationResult,
  PrototypeGenerationResult
} from "./agent-cli.js";

export interface DirectCliAdapterOptions {
  command: string;
  args?: ReadonlyArray<string>;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

/**
 * feegle agent adapter that drives a CLI in non-interactive mode: spawn the
 * configured command, feed the prompt on stdin, and read the final answer from
 * stdout. The CLI's own run log (codex exec, claude -p) goes to stderr, so
 * stdout stays a clean answer. Multi-turn context is carried by the caller
 * replaying the full conversation in the prompt (see FeishuChatHandler), not by
 * per-CLI session resume — this adapter is deliberately stateless.
 *
 * Failures are surfaced, never swallowed: a spawn error (e.g. command not
 * found), a non-zero exit, or a timeout all reject with the command, the
 * exit code/signal, and the captured stderr tail.
 */
export class DirectCliAdapter implements AgentCli {
  constructor(private readonly opts: DirectCliAdapterOptions) {}

  async chat(messages: ReadonlyArray<AgentChatMessage>, options?: AgentRunOptions): Promise<string> {
    return this.runOnce(flattenChat(messages), options);
  }

  async generatePrototype(
    context: AgentRequirementContext,
    options?: AgentRunOptions
  ): Promise<PrototypeGenerationResult> {
    return this.runOnce(promptForPrototype(context), options);
  }

  async generatePlan(
    context: AgentRequirementContext,
    options?: AgentRunOptions
  ): Promise<PlanGenerationResult> {
    return this.runOnce(promptForPlan(context), options);
  }

  async runDevelopmentTask(
    context: AgentRequirementContext,
    repository: AgentRepositoryContext,
    task: string,
    options?: AgentRunOptions
  ): Promise<DevelopmentTaskResult> {
    return this.runOnce(promptForDevelopmentTask(context, repository, task), options);
  }

  private runOnce(prompt: string, options?: AgentRunOptions): Promise<string> {
    const cwd = options?.cwd ?? process.cwd();
    const args = [...(this.opts.args ?? [])];
    const timeoutMs = this.opts.timeoutMs ?? 5 * 60_000;

    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.opts.command, args, {
        cwd,
        env: { ...process.env, ...(this.opts.env ?? {}) },
        stdio: ["pipe", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(() =>
          reject(new Error(`${describe(this.opts.command, args)} timed out after ${timeoutMs}ms`))
        );
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        finish(() =>
          reject(new Error(`failed to spawn ${describe(this.opts.command, args)}: ${error.message}`))
        );
      });

      child.on("close", (code, signal) => {
        finish(() => {
          if (code === 0) {
            resolve(stdout.trim());
            return;
          }
          const reason = signal ? `signal ${signal}` : `code ${code}`;
          reject(
            new Error(
              `${describe(this.opts.command, args)} exited with ${reason}${tail(stderr)}`
            )
          );
        });
      });

      child.stdin.on("error", () => {
        // EPIPE if the CLI exits before reading stdin; the close handler reports
        // the real failure (exit code + stderr), so swallow this one here.
      });
      child.stdin.end(prompt);
    });
  }
}

function describe(command: string, args: ReadonlyArray<string>): string {
  return args.length > 0 ? `\`${command} ${args.join(" ")}\`` : `\`${command}\``;
}

function tail(stderr: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) return "";
  const lines = trimmed.split("\n");
  const lastLines = lines.slice(-10).join("\n");
  return `:\n${lastLines}`;
}

function flattenChat(messages: ReadonlyArray<AgentChatMessage>): string {
  return messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");
}

function promptForPrototype(c: AgentRequirementContext): string {
  return `Generate a clickable prototype for the following requirement.\n\nID: ${c.requirementId}\nTitle: ${c.title}\n\n${c.requirementText}`;
}

function promptForPlan(c: AgentRequirementContext): string {
  return `Generate an implementation plan for:\n\n${c.title}\n\n${c.requirementText}`;
}

function promptForDevelopmentTask(
  c: AgentRequirementContext,
  r: AgentRepositoryContext,
  task: string
): string {
  return `Work on the following task in the repository at ${r.localPath} (branch ${r.branchName}).\n\nRequirement: ${c.title}\n${c.requirementText}\n\nTask: ${task}`;
}
