import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import type { ProviderStore } from "../../../agent/provider-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface MemoryCommandDeps {
  providers: AgentProviderRegistry;
  providerStore: ProviderStore;
}

export class MemoryCommandHandler implements SlashCommandHandler {
  readonly id = "memory";

  constructor(private readonly deps: MemoryCommandDeps) {}

  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活 provider。先运行 /provider use <kind>。");
    }
    const record = this.deps.providerStore.snapshot().providers.find((p) => p.kind === active.kind);
    if (!record) {
      return textReply(`找不到 ${active.kind} 的 provider 记录，请重新 /provider register。`);
    }
    if (!record.cwd) {
      return textReply(`${active.displayName} 未设置工作目录，无项目级记忆文件。请运行 /dir use <workspace> 绑定。`);
    }
    const projectFile = projectMemoryFile(active.kind, record.cwd);
    const globalFile = globalMemoryFile(active.kind);
    const lines: string[] = [`🧠 ${active.displayName} 记忆文件`];
    lines.push(`  项目级: ${projectFile}`);
    lines.push(`  全局级: ${globalFile}`);
    lines.push("");
    lines.push("提示：直接编辑这两个文件即可调整 agent 的记忆指令。");
    return textReply(lines.join("\n"));
  }
}

function projectMemoryFile(kind: string, cwd: string): string {
  if (kind === "claude_code") return join(cwd, "CLAUDE.md");
  if (kind === "codex") return join(cwd, "AGENTS.md");
  return join(cwd, "AGENTS.md");
}

function globalMemoryFile(kind: string): string {
  const home = homedir();
  if (kind === "claude_code") return join(home, ".claude", "CLAUDE.md");
  if (kind === "codex") return join(home, ".codex", "AGENTS.md");
  return join(home, ".config", "agents", "AGENTS.md");
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
