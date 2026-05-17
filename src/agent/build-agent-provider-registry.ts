import { AgentProviderRegistry } from "./agent-provider-registry.js";
import { ClaudeCodeAgentAdapter } from "./claude-code-agent-adapter.js";
import { createClaudeCodeCliPromptRunner } from "./claude-code-cli-runner.js";
import { CodexAgentAdapter } from "./codex-agent-adapter.js";
import { createCodexCliPromptRunner, type CodexCliRunnerOptions } from "./codex-cli-runner.js";

export interface AgentProviderEnv {
  FEEGLE_PROVIDER_CODEX_ENABLED?: string;
  FEEGLE_PROVIDER_CLAUDE_CODE_ENABLED?: string;
  FEEGLE_ACTIVE_PROVIDER?: string;
  FEEGLE_CODEX_COMMAND?: string;
  FEEGLE_CODEX_CWD?: string;
  FEEGLE_CODEX_SANDBOX?: string;
  FEEGLE_CODEX_APPROVAL?: string;
  FEEGLE_CODEX_TIMEOUT_MS?: string;
  FEEGLE_CLAUDE_CODE_COMMAND?: string;
  FEEGLE_CLAUDE_CODE_CWD?: string;
  FEEGLE_CLAUDE_CODE_TIMEOUT_MS?: string;
}

export function buildAgentProviderRegistry(env: AgentProviderEnv): AgentProviderRegistry {
  const registry = new AgentProviderRegistry();

  if (parseBoolean(env.FEEGLE_PROVIDER_CODEX_ENABLED)) {
    const codexOptions: CodexCliRunnerOptions = {
      command: env.FEEGLE_CODEX_COMMAND,
      cwd: requireValue("FEEGLE_CODEX_CWD", env.FEEGLE_CODEX_CWD),
      sandbox: parseCodexSandbox(env.FEEGLE_CODEX_SANDBOX),
      approvalPolicy: parseCodexApproval(env.FEEGLE_CODEX_APPROVAL),
      timeoutMs: parseTimeout(env.FEEGLE_CODEX_TIMEOUT_MS)
    };
    registry.register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => new CodexAgentAdapter(createCodexCliPromptRunner(codexOptions))
    });
  }

  if (parseBoolean(env.FEEGLE_PROVIDER_CLAUDE_CODE_ENABLED)) {
    const claudeOptions = {
      command: env.FEEGLE_CLAUDE_CODE_COMMAND,
      cwd: requireValue("FEEGLE_CLAUDE_CODE_CWD", env.FEEGLE_CLAUDE_CODE_CWD),
      timeoutMs: parseTimeout(env.FEEGLE_CLAUDE_CODE_TIMEOUT_MS)
    };
    registry.register({
      kind: "claude_code",
      displayName: "Claude Code",
      buildAgent: () => new ClaudeCodeAgentAdapter(createClaudeCodeCliPromptRunner(claudeOptions))
    });
  }

  const activeKind = env.FEEGLE_ACTIVE_PROVIDER?.trim();
  if (activeKind && registry.available().some((provider) => provider.kind === activeKind)) {
    registry.setActive(activeKind);
  }
  return registry;
}

function parseBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function requireValue(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} must be set when the corresponding provider is enabled`);
  }
  return trimmed;
}

function parseCodexSandbox(value: string | undefined): CodexCliRunnerOptions["sandbox"] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === "read-only" || trimmed === "workspace-write" || trimmed === "danger-full-access") {
    return trimmed;
  }
  throw new Error(`FEEGLE_CODEX_SANDBOX must be read-only|workspace-write|danger-full-access (got ${trimmed})`);
}

function parseCodexApproval(value: string | undefined): CodexCliRunnerOptions["approvalPolicy"] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed === "untrusted" || trimmed === "on-request" || trimmed === "never") {
    return trimmed;
  }
  throw new Error(`FEEGLE_CODEX_APPROVAL must be untrusted|on-request|never (got ${trimmed})`);
}

function parseTimeout(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`timeout must be a positive number (got ${trimmed})`);
  }
  return parsed;
}
