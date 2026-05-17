import { execa } from "execa";
import type { PromptRunner } from "./codex-agent-adapter.js";

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
  options: { input: string; timeout: number }
) => Promise<CodexCliCommandResult>;

const defaultRunner: CodexCliCommandRunner = async (command, args, options) => {
  const result = await execa(command, args, {
    input: options.input,
    timeout: options.timeout
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export function createCodexCliPromptRunner(
  options: CodexCliRunnerOptions,
  runner: CodexCliCommandRunner = defaultRunner
): PromptRunner {
  return async (prompt) => {
    const result = await runner(options.command ?? "codex", buildCodexArgs(options), {
      input: prompt,
      timeout: options.timeoutMs ?? 300_000
    });

    return result.stdout.trim();
  };
}

function buildCodexArgs(options: CodexCliRunnerOptions): string[] {
  return [
    "exec",
    "--cd",
    options.cwd,
    "--sandbox",
    options.sandbox ?? "workspace-write",
    "--ask-for-approval",
    options.approvalPolicy ?? "never",
    "-"
  ];
}
