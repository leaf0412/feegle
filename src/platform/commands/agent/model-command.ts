import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import type { ProviderKind, ProviderStorePort } from "../../../agent/provider-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface ModelCommandDeps {
  providers: AgentProviderRegistry;
  providerStore: ProviderStorePort;
}

export class ModelCommandHandler implements SlashCommandHandler {
  readonly id = "model";

  constructor(private readonly deps: ModelCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活 provider。先运行 /provider use <kind> 激活后再设置模型。");
    }
    const record = this.deps.providerStore.snapshot().providers.find((p) => p.kind === active.kind);
    const current = record?.model;
    const arg = context.args.trim();
    if (!arg) {
      const value = current ? `\`${current}\`` : "（未设置，使用 CLI 默认）";
      return textReply(`${active.displayName} 当前模型: ${value}\n用法：/model <name>`);
    }
    try {
      await this.deps.providerStore.updateSettings(active.kind as ProviderKind, { model: arg });
    } catch (error) {
      return textReply(`设置失败: ${errorMessage(error)}`);
    }
    return textReply(`✅ ${active.displayName} 模型已设置为 \`${arg}\`。下一次会话生效。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
