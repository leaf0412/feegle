import { createCodexCliPromptRunner } from "./codex-cli-runner.js";
import { PromptAgentAdapter, type PromptRunner } from "./prompt-agent-adapter.js";
import { registerAgent } from "./agent-registry.js";

export type { PromptRunner };

export class CodexAgentAdapter extends PromptAgentAdapter {}

registerAgent("codex", "Codex", (record) => {
  return new CodexAgentAdapter(
    createCodexCliPromptRunner({
      command: record.command as string | undefined,
      cwd: record.cwd as string,
      sandbox: record.sandbox as "read-only" | "workspace-write" | "danger-full-access" | undefined,
      approvalPolicy: record.approvalPolicy as "untrusted" | "on-request" | "never" | undefined,
      timeoutMs: record.timeoutMs as number | undefined,
      model: record.model as string | undefined,
      reasoningEffort: record.reasoningEffort as "low" | "medium" | "high" | undefined,
      allowedTools: record.allowedTools as readonly string[] | undefined
    })
  );
});
