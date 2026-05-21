import { execa } from "execa";
import { AgentStreamParser } from "./agent-stream-parser.js";
import { consumeStdoutLines } from "./stdout-line-consumer.js";
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
  options: { cwd: string; input: string; timeout: number; onStdoutLine?: (line: string) => Promise<void> }
) => Promise<ClaudeCodeCliCommandResult>;

const defaultRunner: ClaudeCodeCliCommandRunner = async (command, args, options) => {
  const subprocess = execa(command, args, {
    cwd: options.cwd,
    input: options.input,
    timeout: options.timeout
  });
  const stdoutLineConsumption = consumeStdoutLines(subprocess.stdout, options.onStdoutLine);
  const result = await subprocess;
  await stdoutLineConsumption;
  return { stdout: options.onStdoutLine ? "" : result.stdout, stderr: result.stderr };
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
    const parser = new AgentStreamParser(runOptions);
    try {
      const result = await runner(options.command ?? "claude", buildClaudeCodeArgs(options), {
        cwd,
        input: `${JSON.stringify(buildUserMessage(prompt))}\n`,
        timeout: options.timeoutMs ?? 300_000,
        onStdoutLine: async (line) => {
          await parseClaudeLine(line, parser);
        }
      });
      return parseSuccessfulResult(result.stdout, parser);
    } catch (error) {
      const stdout = readErrorStdout(error);
      if (stdout) {
        throw new Error((await parseFinalResult(stdout, parser)).text);
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

async function parseSuccessfulResult(stdout: string, parser: AgentStreamParser): Promise<string> {
  const result = await parseFinalResult(stdout, parser);
  if (result.isError) {
    throw new Error(result.text);
  }
  return result.text;
}

async function parseFinalResult(stdout: string, parser: AgentStreamParser): Promise<{ text: string; isError: boolean }> {
  let result: { text: string; isError: boolean } | undefined;
  for (const line of stdout.trim().split("\n")) {
    const parsed = await parseClaudeLine(line, parser);
    if (parsed) {
      result = parsed;
    }
  }
  if (result) {
    return result;
  }
  throw new Error("Claude Code did not emit a result event");
}

async function parseClaudeLine(
  line: string,
  parser: AgentStreamParser
): Promise<{ text: string; isError: boolean } | undefined> {
  if (!line.trim()) {
    return undefined;
  }
  const event = JSON.parse(line) as unknown;
  if (!isRecord(event)) {
    return undefined;
  }
  if (event.type === "result" && typeof event.result === "string") {
    await parser.finalResult(event.result);
    if (event.is_error === true) {
      await parser.error(event.result);
    }
    return {
      text: event.result.trim(),
      isError: event.is_error === true
    };
  }
  const message = event.message;
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return undefined;
  }
  for (const part of message.content) {
    await emitClaudeContentPart(part, parser);
  }
  return undefined;
}

async function emitClaudeContentPart(part: unknown, parser: AgentStreamParser): Promise<void> {
  if (!isRecord(part)) {
    return;
  }
  if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
    await parser.assistantMessage(part.text);
    return;
  }
  if (part.type === "tool_use") {
    await parser.toolUse(typeof part.name === "string" ? part.name : "Tool", stringifyUnknown(part.input));
    return;
  }
  if (part.type === "tool_result") {
    await parser.toolResult(undefined, stringifyUnknown(part.content));
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
