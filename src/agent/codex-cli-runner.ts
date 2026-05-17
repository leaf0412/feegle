import { execa } from "execa";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    const outputDirectory = await mkdtemp(join(tmpdir(), "feegle-codex-"));
    const outputPath = join(outputDirectory, "last-message.txt");
    try {
      await runner(options.command ?? "codex", buildCodexArgs(options, outputPath), {
        input: prompt,
        timeout: options.timeoutMs ?? 300_000
      });

      return (await readFile(outputPath, "utf8")).trim();
    } finally {
      await rm(outputDirectory, { force: true, recursive: true });
    }
  };
}

function buildCodexArgs(options: CodexCliRunnerOptions, outputPath: string): string[] {
  return [
    "--ask-for-approval",
    options.approvalPolicy ?? "never",
    "exec",
    "--cd",
    options.cwd,
    "--sandbox",
    options.sandbox ?? "workspace-write",
    "--output-last-message",
    outputPath,
    "-"
  ];
}
