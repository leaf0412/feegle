import { createClaudeCodeCliPromptRunner } from "./claude-code-cli-runner.js";
import { PromptAgentAdapter } from "./prompt-agent-adapter.js";
import { registerAgent } from "./agent-registry.js";
import { resolveBinary } from "./binary-resolver.js";

export class ClaudeCodeAgentAdapter extends PromptAgentAdapter {}

registerAgent("claude_code", "Claude Code", (record) => {
  return new ClaudeCodeAgentAdapter(
    createClaudeCodeCliPromptRunner({
      command: resolveBinary((record.command as string) || "claude"),
      cwd: record.cwd as string,
      timeoutMs: record.timeoutMs as number | undefined,
      model: record.model as string | undefined,
      mode: record.mode as string | undefined,
      allowedTools: record.allowedTools as readonly string[] | undefined
    })
  );
});
