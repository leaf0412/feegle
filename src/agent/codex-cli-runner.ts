import { execa } from "execa";
import type { PromptRunner } from "./codex-agent-adapter.js";
import { AgentStreamParser } from "./agent-stream-parser.js";
import { consumeStdoutLines } from "./stdout-line-consumer.js";

export interface CodexCliRunnerOptions {
  command?: string;
  cwd?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy?: "untrusted" | "on-request" | "never";
  timeoutMs?: number;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  allowedTools?: readonly string[];
}

export interface CodexCliCommandResult {
  stdout: string;
  stderr: string;
}

export type CodexCliCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; input: string; timeout: number; onStdoutLine?: (line: string) => Promise<void> }
) => Promise<CodexCliCommandResult>;

const defaultRunner: CodexCliCommandRunner = async (command, args, options) => {
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

export function createCodexCliPromptRunner(
  options: CodexCliRunnerOptions,
  runner: CodexCliCommandRunner = defaultRunner
): PromptRunner {
  return async (prompt, runOptions) => {
    const cwd = runOptions?.cwd ?? options.cwd;
    if (!cwd) {
      throw new Error("未设置工作目录。请运行 /dir use <workspace> 来设置。");
    }
    const parser = new AgentStreamParser(runOptions);
    const result = await runner(options.command ?? "codex", buildCodexArgs(options, cwd), {
      cwd,
      input: prompt,
      timeout: options.timeoutMs ?? 300_000,
      onStdoutLine: async (line) => {
        await parseCodexJsonLine(line, parser);
      }
    });

    await parseCodexJsonOutput(result.stdout, parser);
    return parser.finalize();
  };
}

function buildCodexArgs(options: CodexCliRunnerOptions, cwd: string): string[] {
  const args: string[] = [
    "--ask-for-approval",
    options.approvalPolicy ?? "never"
  ];
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${options.reasoningEffort}"`);
  }
  args.push(
    "exec",
    "--skip-git-repo-check",
    "--cd",
    cwd,
    "--sandbox",
    options.sandbox ?? "workspace-write",
    "--json",
    "-"
  );
  return args;
}

async function parseCodexJsonOutput(stdout: string, parser: AgentStreamParser): Promise<void> {
  for (const line of stdout.split(/\r?\n/)) {
    await parseCodexJsonLine(line, parser);
  }
}

async function parseCodexJsonLine(line: string, parser: AgentStreamParser): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  const event = parseCodexEvent(trimmed);
  if (event.type === "turn.failed") {
    await parser.error(readTurnFailureMessage(event));
    throw new Error(readTurnFailureMessage(event));
  }
  if (event.type === "turn.completed") {
    return;
  }
  if (event.type !== "item.completed") {
    return;
  }
  const item = readRecord(event.item);
  const itemType = readString(item.type);
  if (itemType === "agent_message" || itemType === "message") {
    await parser.assistantMessage(extractItemText(item));
    return;
  }
  await emitCodexProgress(itemType, item, parser);
}

async function emitCodexProgress(
  itemType: string,
  item: Record<string, unknown>,
  parser: AgentStreamParser
): Promise<void> {
  if (itemType === "tool_call" || itemType === "function_call") {
    await parser.toolUse(
      readString(item.name) || readString(item.tool_name) || "Tool",
      readString(item.arguments) || readString(item.input) || stringifyRecord(item)
    );
    return;
  }
  if (itemType === "tool_result" || itemType === "function_call_output") {
    await parser.toolResult(
      readString(item.name) || readString(item.tool_name) || undefined,
      readString(item.output) || readString(item.result) || stringifyRecord(item)
    );
    return;
  }
  if (itemType === "reasoning" || itemType === "reasoning_summary") {
    const text = extractReasoningText(item);
    if (text) {
      await parser.reasoning(text);
    }
  }
}

function parseCodexEvent(line: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(line);
    return readRecord(parsed);
  } catch (error) {
    throw new Error(`Invalid Codex JSON event: ${errorMessage(error)}`);
  }
}

function extractItemText(item: Record<string, unknown>): string {
  const directText = readString(item.text);
  if (directText) {
    return directText.trim();
  }

  const content = item.content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      const record = readRecord(part);
      return readString(record.text);
    })
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}

function extractReasoningText(item: Record<string, unknown>): string {
  const directText = readString(item.text);
  if (directText) {
    return directText.trim();
  }

  const summary = item.summary;
  if (!Array.isArray(summary)) {
    return "";
  }

  return summary
    .map((part) => {
      const record = readRecord(part);
      return readString(record.text);
    })
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}

function readTurnFailureMessage(event: Record<string, unknown>): string {
  const error = readRecord(event.error);
  const message = readString(error.message).trim();
  return message || "Codex turn failed";
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringifyRecord(value: Record<string, unknown>): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
