import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import {
  REASONING_EFFORTS,
  type ProviderKind,
  type ProviderStore,
  type ReasoningEffort
} from "../../../agent/provider-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface ReasoningCommandDeps {
  providers: AgentProviderRegistry;
  providerStore: ProviderStore;
}

export class ReasoningCommandHandler implements SlashCommandHandler {
  readonly id = "reasoning";

  constructor(private readonly deps: ReasoningCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活 provider。先运行 /provider use <kind>。");
    }
    if (active.kind !== "codex") {
      return textReply(`${active.displayName} (${active.kind}) 不支持 reasoning effort 切换（仅 codex）。`);
    }
    const record = this.deps.providerStore.snapshot().providers.find((p) => p.kind === "codex");
    const current = record?.reasoningEffort;
    const arg = context.args.trim().toLowerCase();
    if (!arg) {
      const value = current ? `\`${current}\`` : "（未设置，使用 codex 默认）";
      return textReply(
        `codex 当前 reasoning effort: ${value}\n可选: ${REASONING_EFFORTS.join(" / ")}\n用法：/reasoning <level>`
      );
    }
    if (!isReasoningEffort(arg)) {
      return textReply(`未知 effort：${arg}。可选: ${REASONING_EFFORTS.join(", ")}`);
    }
    try {
      await this.deps.providerStore.updateSettings("codex" as ProviderKind, { reasoningEffort: arg });
    } catch (error) {
      return textReply(`设置失败: ${errorMessage(error)}`);
    }
    return textReply(`✅ codex reasoning effort 已设置为 \`${arg}\`。下一次会话生效。`);
  }
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
