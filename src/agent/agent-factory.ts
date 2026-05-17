import type { AgentCli } from "./agent-cli.js";
import { ClaudeCodeAgentAdapter } from "./claude-code-agent-adapter.js";
import {
  createClaudeCodeCliPromptRunner,
  type ClaudeCodeCliRunnerOptions
} from "./claude-code-cli-runner.js";
import { CodexAgentAdapter } from "./codex-agent-adapter.js";
import {
  createCodexCliPromptRunner,
  type CodexCliRunnerOptions
} from "./codex-cli-runner.js";
import type { PromptRunner } from "./prompt-agent-adapter.js";

export type FeegleAgentKind = "codex" | "claude_code";

export interface FeegleAgentConfig {
  kind?: FeegleAgentKind;
  command?: string;
  cwd: string;
  sandbox?: CodexCliRunnerOptions["sandbox"];
  approvalPolicy?: CodexCliRunnerOptions["approvalPolicy"];
  timeoutMs?: number;
}

export interface ConfiguredFeegleAgent {
  agent: AgentCli;
  displayName: string;
}

interface FeegleAgentFactoryDependencies {
  createCodexPromptRunner?: (options: CodexCliRunnerOptions) => PromptRunner;
  createClaudeCodePromptRunner?: (options: ClaudeCodeCliRunnerOptions) => PromptRunner;
}

export function createFeegleAgent(
  config: FeegleAgentConfig,
  dependencies: FeegleAgentFactoryDependencies = {}
): ConfiguredFeegleAgent {
  if (config.kind === "claude_code") {
    const runner = (dependencies.createClaudeCodePromptRunner ?? createClaudeCodeCliPromptRunner)({
      command: config.command,
      cwd: config.cwd,
      timeoutMs: config.timeoutMs
    });
    return {
      agent: new ClaudeCodeAgentAdapter(runner),
      displayName: "Claude Code"
    };
  }

  const runner = (dependencies.createCodexPromptRunner ?? createCodexCliPromptRunner)({
    command: config.command,
    cwd: config.cwd,
    sandbox: config.sandbox,
    approvalPolicy: config.approvalPolicy,
    timeoutMs: config.timeoutMs
  });
  return {
    agent: new CodexAgentAdapter(runner),
    displayName: "Codex"
  };
}
