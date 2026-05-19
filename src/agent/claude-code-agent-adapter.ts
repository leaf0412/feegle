import { createClaudeCodeCliPromptRunner } from "./claude-code-cli-runner.js";
import { PromptAgentAdapter } from "./prompt-agent-adapter.js";
import { registerAgent } from "./agent-registry.js";

export class ClaudeCodeAgentAdapter extends PromptAgentAdapter {}

registerAgent("claude_code", "Claude Code", (record) => {
  return new ClaudeCodeAgentAdapter(
    createClaudeCodeCliPromptRunner({
      command: record.command as string | undefined,
      cwd: record.cwd as string,
      timeoutMs: record.timeoutMs as number | undefined
    })
  );
});
