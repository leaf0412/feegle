import { execa } from "execa";
import type { PromptRunner } from "./codex-agent-adapter.js";
import type { AgentRunOptions } from "./agent-cli.js";

export interface CodexCliRunnerOptions {
  command?: string;
  cwd: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  approvalPolicy?: "untrusted" | "on-request" | "never";
  timeoutMs?: number;
}

export interface CodexCliCommandResult {
  stdout: string;
  stderr: string;
}

export type CodexCliCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; input: string; timeout: number }
) => Promise<CodexCliCommandResult>;

const defaultRunner: CodexCliCommandRunner = async (command, args, options) => {
  const result = await execa(command, args, {
    cwd: options.cwd,
    input: options.input,
    timeout: options.timeout
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export function createCodexCliPromptRunner(
  options: CodexCliRunnerOptions,
  runner: CodexCliCommandRunner = defaultRunner
): PromptRunner {
  return async (prompt, runOptions) => {
    const result = await runner(options.command ?? "codex", buildCodexArgs(options), {
      cwd: options.cwd,
      input: prompt,
      timeout: options.timeoutMs ?? 300_000
    });

    return parseCodexJsonOutput(result.stdout, runOptions);
  };
}

function buildCodexArgs(options: CodexCliRunnerOptions): string[] {
  return [
    "--ask-for-approval",
    options.approvalPolicy ?? "never",
    "exec",
    "--skip-git-repo-check",
    "--cd",
    options.cwd,
    "--sandbox",
    options.sandbox ?? "workspace-write",
    "--json",
    "-"
  ];
}

function parseCodexJsonOutput(stdout: string, options?: AgentRunOptions): string {
  const messages: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const event = parseCodexEvent(trimmed);
    if (event.type === "turn.failed") {
      options?.onProgress?.({ kind: "error", text: readTurnFailureMessage(event) });
      throw new Error(readTurnFailureMessage(event));
    }
    if (event.type !== "item.completed") {
      continue;
    }
    const item = readRecord(event.item);
    const itemType = readString(item.type);
    emitCodexProgress(itemType, item, options);
    if (itemType !== "agent_message" && itemType !== "message") {
      continue;
    }
    const text = extractItemText(item);
    if (text) {
      messages.push(text);
    }
  }

  const response = messages.join("\n\n").trim();
  if (!response) {
    throw new Error("Codex completed without an agent message");
  }
  return response;
}

function emitCodexProgress(itemType: string, item: Record<string, unknown>, options?: AgentRunOptions): void {
  if (!options?.onProgress) {
    return;
  }
  if (itemType === "tool_call" || itemType === "function_call") {
    options.onProgress({
      kind: "tool_use",
      tool: readString(item.name) || readString(item.tool_name) || "Tool",
      text: readString(item.arguments) || readString(item.input) || stringifyRecord(item)
    });
    return;
  }
  if (itemType === "tool_result" || itemType === "function_call_output") {
    options.onProgress({
      kind: "tool_result",
      tool: readString(item.name) || readString(item.tool_name) || undefined,
      text: readString(item.output) || readString(item.result) || stringifyRecord(item)
    });
    return;
  }
  if (itemType === "agent_message" || itemType === "message") {
    const text = extractItemText(item);
    if (text) {
      options.onProgress({ kind: "thinking", text });
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
