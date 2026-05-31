import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import type { ConfigStorePort } from "@infra/app/config-store.js";
import type {
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface ConfigCommandDeps {
  configStore: ConfigStorePort;
  providers: AgentProviderRegistry;
}

export class ConfigCommandHandler implements SlashCommandHandler {
  readonly id = "config";

  constructor(private readonly deps: ConfigCommandDeps) {}

  async execute(): Promise<SlashCommandReply> {
    const config = this.deps.configStore.get();
    const active = this.deps.providers.active();
    const available = this.deps.providers.available();

    const lines: string[] = ["📋 当前运行配置"];
    lines.push("");
    lines.push("故障通知:");
    lines.push(
      config.failureTarget
        ? `  • ${config.failureTarget.platform}:${config.failureTarget.chatId}`
        : "  • 未设置（运行 /error_target set 绑定到当前群）"
    );
    lines.push("");
    lines.push("Agent providers:");
    if (available.length === 0) {
      lines.push("  • 未注册（运行 /provider register <kind> cwd=<path>）");
    } else {
      for (const provider of available) {
        const marker = active?.kind === provider.kind ? "★ active" : "—";
        lines.push(`  • ${provider.displayName} (${provider.kind}) ${marker}`);
      }
    }

    return { kind: "text", text: lines.join("\n") };
  }
}
