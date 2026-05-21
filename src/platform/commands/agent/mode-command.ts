import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import {
  CLAUDE_PERMISSION_MODES,
  type ClaudePermissionMode,
  type ProviderKind,
  type ProviderStorePort
} from "../../../agent/provider-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface ModeCommandDeps {
  providers: AgentProviderRegistry;
  providerStore: ProviderStorePort;
}

export class ModeCommandHandler implements SlashCommandHandler {
  readonly id = "mode";

  constructor(private readonly deps: ModeCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活 provider。先运行 /provider use <kind>。");
    }
    if (active.kind !== "claude_code") {
      return textReply(`${active.displayName} (${active.kind}) 不支持 permission mode 切换（仅 claude_code）。`);
    }
    const record = this.deps.providerStore.snapshot().providers.find((p) => p.kind === "claude_code");
    const current = record?.mode;
    const arg = context.args.trim();
    if (!arg) {
      const value = current ? `\`${current}\`` : "（未设置，使用 claude CLI 默认）";
      return textReply(
        `Claude Code 当前 permission mode: ${value}\n可选: ${CLAUDE_PERMISSION_MODES.join(" / ")}\n用法：/mode <name>`
      );
    }
    if (!isMode(arg)) {
      return textReply(`未知 mode：${arg}。可选: ${CLAUDE_PERMISSION_MODES.join(", ")}`);
    }
    try {
      await this.deps.providerStore.updateSettings("claude_code" as ProviderKind, { mode: arg });
    } catch (error) {
      return textReply(`设置失败: ${errorMessage(error)}`);
    }
    return textReply(`✅ Claude Code permission mode 已设置为 \`${arg}\`。下一次会话生效。`);
  }
}

function isMode(value: string): value is ClaudePermissionMode {
  return (CLAUDE_PERMISSION_MODES as readonly string[]).includes(value);
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
