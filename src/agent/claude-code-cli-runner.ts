import { execa } from "execa";
import type { AgentRunOptions } from "./agent-cli.js";
import type { PromptRunner } from "./prompt-agent-adapter.js";

export interface ClaudeCodeCliRunnerOptions {
  command?: string;
  cwd?: string;
  timeoutMs?: number;
  model?: string;
  mode?: string;
  allowedTools?: readonly string[];
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
  return async (prompt, runOptions) => {
    const cwd = runOptions?.cwd ?? options.cwd;
    if (!cwd) {
      throw new Error("未设置工作目录。请运行 /dir use <workspace> 来设置。");
    }
    try {
      const result = await runner(options.command ?? "claude", buildClaudeCodeArgs(options), {
        cwd,
        input: `${JSON.stringify(buildUserMessage(prompt))}\n`,
        timeout: options.timeoutMs ?? 300_000
      });
      return parseSuccessfulResult(result.stdout, runOptions);
    } catch (error) {
      const stdout = readErrorStdout(error);
      if (stdout) {
        throw new Error(parseFinalResult(stdout, runOptions).text);
      }
      throw error;
    }
  };
}

function buildClaudeCodeArgs(options: ClaudeCodeCliRunnerOptions): string[] {
  const args: string[] = [
    "-p",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose"
  ];
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.mode) {
    args.push("--permission-mode", options.mode);
  }
  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push("--allowedTools", options.allowedTools.join(","));
  }
  return args;
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

function parseSuccessfulResult(stdout: string, options?: AgentRunOptions): string {
  const result = parseFinalResult(stdout, options);
  if (result.isError) {
    throw new Error(result.text);
  }
  return result.text;
}

function parseFinalResult(stdout: string, options?: AgentRunOptions): { text: string; isError: boolean } {
  for (const line of stdout.trim().split("\n").reverse()) {
    if (!line.trim()) {
      continue;
    }
    const event = JSON.parse(line) as unknown;
    if (isRecord(event) && event.type === "result" && typeof event.result === "string") {
      emitClaudeProgress(stdout, options);
      if (event.is_error === true) {
        options?.onProgress?.({ kind: "error", text: event.result });
      }
      return {
        text: event.result.trim(),
        isError: event.is_error === true
      };
    }
  }
  throw new Error("Claude Code did not emit a result event");
}

function emitClaudeProgress(stdout: string, options?: AgentRunOptions): void {
  if (!options?.onProgress) {
    return;
  }

  for (const line of stdout.trim().split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const event = JSON.parse(line) as unknown;
    if (!isRecord(event) || event.type === "result") {
      continue;
    }
    const message = event.message;
    if (!isRecord(message) || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      emitClaudeContentPart(part, options);
    }
  }
}

function emitClaudeContentPart(part: unknown, options: AgentRunOptions): void {
  if (!isRecord(part)) {
    return;
  }
  if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
    options.onProgress?.({ kind: "thinking", text: part.text.trim() });
    return;
  }
  if (part.type === "tool_use") {
    options.onProgress?.({
      kind: "tool_use",
      tool: typeof part.name === "string" ? part.name : "Tool",
      text: stringifyUnknown(part.input)
    });
    return;
  }
  if (part.type === "tool_result") {
    options.onProgress?.({
      kind: "tool_result",
      text: stringifyUnknown(part.content)
    });
  }
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

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
