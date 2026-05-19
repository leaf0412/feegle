import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import type { ProviderKind, ProviderStore } from "../../../agent/provider-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface AllowCommandDeps {
  providers: AgentProviderRegistry;
  providerStore: ProviderStore;
}

export class AllowCommandHandler implements SlashCommandHandler {
  readonly id = "allow";
  readonly ownerOnly = true;

  constructor(private readonly deps: AllowCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活 provider。先运行 /provider use <kind>。");
    }
    const record = this.deps.providerStore.snapshot().providers.find((p) => p.kind === active.kind);
    const current = record?.allowedTools ?? [];

    const arg = context.args.trim();
    if (!arg || arg === "list") {
      if (current.length === 0) {
        return textReply(`${active.displayName} 当前 allowed tools: （空，CLI 默认权限）\n用法：/allow <tool>[,<tool>...] | /allow clear`);
      }
      return textReply(`${active.displayName} 当前 allowed tools:\n  ${current.join("\n  ")}`);
    }
    if (arg === "clear") {
      await this.deps.providerStore.updateSettings(active.kind as ProviderKind, { allowedTools: [] });
      return textReply(`✅ ${active.displayName} allowed tools 已清空。下一次会话生效。`);
    }
    const additions = arg.split(/[,\s]+/).map((tool) => tool.trim()).filter(Boolean);
    if (additions.length === 0) {
      return textReply("用法：/allow <tool>[,<tool>...] | /allow list | /allow clear");
    }
    const merged = Array.from(new Set([...current, ...additions]));
    try {
      await this.deps.providerStore.updateSettings(active.kind as ProviderKind, { allowedTools: merged });
    } catch (error) {
      return textReply(`设置失败: ${errorMessage(error)}`);
    }
    return textReply(`✅ 已授权工具（共 ${merged.length}）。下一次会话生效。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
