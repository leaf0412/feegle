import { execa } from "execa";
import type { PromptRunner } from "./prompt-agent-adapter.js";

export interface ClaudeCodeCliRunnerOptions {
  command?: string;
  cwd: string;
  timeoutMs?: number;
}

export interface ClaudeCodeCliCommandResult {
  stdout: string;
  stderr: string;
}

export type ClaudeCodeCliCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; input: string; timeout: number }
) => Promise<ClaudeCodeCliCommandResult>;

const defaultRunner: ClaudeCodeCliCommandRunner = async (command, args, options) => {
  const result = await execa(command, args, {
    cwd: options.cwd,
    input: options.input,
    timeout: options.timeout
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export function createClaudeCodeCliPromptRunner(
  options: ClaudeCodeCliRunnerOptions,
  runner: ClaudeCodeCliCommandRunner = defaultRunner
): PromptRunner {
  return async (prompt) => {
    try {
      const result = await runner(options.command ?? "claude", buildClaudeCodeArgs(), {
        cwd: options.cwd,
        input: `${JSON.stringify(buildUserMessage(prompt))}\n`,
        timeout: options.timeoutMs ?? 300_000
      });
      return parseSuccessfulResult(result.stdout);
    } catch (error) {
      const stdout = readErrorStdout(error);
      if (stdout) {
        throw new Error(parseFinalResult(stdout).text);
      }
      throw error;
    }
  };
}

function buildClaudeCodeArgs(): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose"
  ];
}

function buildUserMessage(prompt: string): unknown {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }]
    }
  };
}

function parseSuccessfulResult(stdout: string): string {
  const result = parseFinalResult(stdout);
  if (result.isError) {
    throw new Error(result.text);
  }
  return result.text;
}

function parseFinalResult(stdout: string): { text: string; isError: boolean } {
  for (const line of stdout.trim().split("\n").reverse()) {
    if (!line.trim()) {
      continue;
    }
    const event = JSON.parse(line) as unknown;
    if (isRecord(event) && event.type === "result" && typeof event.result === "string") {
      return {
        text: event.result.trim(),
        isError: event.is_error === true
      };
    }
  }
  throw new Error("Claude Code did not emit a result event");
}

function readErrorStdout(error: unknown): string {
  if (isRecord(error) && typeof error.stdout === "string") {
    return error.stdout;
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
