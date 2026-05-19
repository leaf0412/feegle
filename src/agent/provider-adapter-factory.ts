import { ClaudeCodeAgentAdapter } from "./claude-code-agent-adapter.js";
import { CodexAgentAdapter } from "./codex-agent-adapter.js";
import { createClaudeCodeCliPromptRunner } from "./claude-code-cli-runner.js";
import { createCodexCliPromptRunner } from "./codex-cli-runner.js";
import type { AgentCli } from "./agent-cli.js";
import type { ProviderKind, ProviderRecord } from "./provider-store.js";

export function buildProviderAdapter(record: ProviderRecord): AgentCli {
  switch (record.kind) {
    case "codex":
      return new CodexAgentAdapter(
        createCodexCliPromptRunner({
          command: record.command,
          cwd: record.cwd,
          sandbox: record.sandbox,
          approvalPolicy: record.approvalPolicy,
          timeoutMs: record.timeoutMs
        })
      );
    case "claude_code":
      return new ClaudeCodeAgentAdapter(
        createClaudeCodeCliPromptRunner({
          command: record.command,
          cwd: record.cwd,
          timeoutMs: record.timeoutMs
        })
      );
  }
}

export function defaultProviderDisplayName(kind: ProviderKind): string {
  switch (kind) {
    case "codex":
      return "Codex";
    case "claude_code":
      return "Claude Code";
  }
}
