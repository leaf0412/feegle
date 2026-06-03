import { spawn } from "node:child_process";
import readline from "node:readline";
import type { Agent, AgentEvent, AgentSession, AgentSessionOptions } from "./agent-session.js";

/** A line-oriented parser that turns one CLI's stdout into normalized events. */
export interface LineParser {
  push(line: string): AgentEvent[];
  currentSessionId(): string | undefined;
}

export interface CliAgentConfig {
  command: string;
  /** Prefix args before the CLI subcommand (mainly for tests, e.g. node -e). */
  args?: ReadonlyArray<string>;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
  /** Build the CLI-specific argv, given the resume context for this turn. */
  buildArgs: (ctx: { resumeSessionId?: string }) => string[];
  createParser: () => LineParser;
}

/**
 * Shared driver for every headless CLI agent: spawn the process, feed the
 * prompt on stdin, read stdout line by line through a CLI-specific
 * {@link LineParser}, and stream the normalized events. Failures (spawn error,
 * non-zero exit, timeout) reject the iteration — never swallowed. Each CLI
 * differs only in its argv ({@link CliAgentConfig.buildArgs}) and parser.
 */
export class CliAgent implements Agent {
  constructor(private readonly config: CliAgentConfig) {}

  startSession(options?: AgentSessionOptions): AgentSession {
    return new CliSession(this.config, options);
  }
}

class CliSession implements AgentSession {
  private readonly parser: LineParser;

  constructor(
    private readonly config: CliAgentConfig,
    private readonly options?: AgentSessionOptions
  ) {
    this.parser = config.createParser();
  }

  currentSessionId(): string | undefined {
    return this.parser.currentSessionId();
  }

  async close(): Promise<void> {
    // Stateless per turn: each send() owns its own process; nothing to tear down.
  }

  send(prompt: string): AsyncIterable<AgentEvent> {
    return this.run(prompt);
  }

  private async *run(prompt: string): AsyncIterable<AgentEvent> {
    const args = [
      ...(this.config.args ?? []),
      ...this.config.buildArgs({ resumeSessionId: this.options?.resumeSessionId })
    ];
    const label = describe(this.config.command, args);
    const timeoutMs = this.config.timeoutMs ?? 5 * 60_000;

    const child = spawn(this.config.command, args, {
      cwd: this.options?.cwd,
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"]
    });

    const queue: AgentEvent[] = [];
    let wake: (() => void) | null = null;
    const bump = (): void => {
      if (wake) {
        wake();
        wake = null;
      }
    };

    // Mutated from event handlers (closures). Held on one object so TS keeps the
    // declared types at read sites instead of narrowing to the initializer.
    const state: {
      stderr: string;
      linesDone: boolean;
      exit: { code: number | null; signal: NodeJS.Signals | null } | null;
      failure: Error | null;
    } = { stderr: "", linesDone: false, exit: null, failure: null };

    child.stderr.on("data", (chunk) => {
      state.stderr += chunk.toString();
    });
    child.stdin.on("error", () => {
      // EPIPE if the CLI exits before reading stdin; the close handler reports
      // the real failure (exit code + stderr).
    });
    child.stdin.end(prompt);

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      for (const event of this.parser.push(line)) queue.push(event);
      bump();
    });
    rl.on("close", () => {
      state.linesDone = true;
      bump();
    });
    child.on("close", (code, signal) => {
      state.exit = { code, signal };
      bump();
    });
    child.on("error", (error) => {
      state.failure = new Error(`failed to spawn ${label}: ${error.message}`);
      state.linesDone = true;
      bump();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      state.failure = new Error(`${label} timed out after ${timeoutMs}ms`);
      bump();
    }, timeoutMs);

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift() as AgentEvent;
        }
        if (state.failure) throw state.failure;
        if (state.linesDone && state.exit) {
          if (state.exit.code !== 0) {
            const reason = state.exit.signal
              ? `signal ${state.exit.signal}`
              : `code ${state.exit.code}`;
            throw new Error(`${label} exited with ${reason}${tail(state.stderr)}`);
          }
          break;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      clearTimeout(timer);
      rl.close();
    }
  }
}

function describe(command: string, args: ReadonlyArray<string>): string {
  return args.length > 0 ? `\`${command} ${args.join(" ")}\`` : `\`${command}\``;
}

function tail(stderr: string): string {
  const trimmed = stderr.trim();
  if (!trimmed) return "";
  return `:\n${trimmed.split("\n").slice(-10).join("\n")}`;
}
