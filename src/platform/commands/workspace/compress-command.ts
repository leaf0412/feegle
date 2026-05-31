import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import {
  hasCapability,
  type ContextCompressor
} from "@integrations/agent/agent-capabilities.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface CompressCommandDeps {
  providers: AgentProviderRegistry;
}

export class CompressCommandHandler implements SlashCommandHandler {
  readonly id = "compress";

  constructor(private readonly deps: CompressCommandDeps) {}

  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活 provider。先 /provider use <kind>。");
    }
    let agent;
    try {
      agent = active.buildAgent();
    } catch (error) {
      return textReply(`构造 agent 失败: ${errorMessage(error)}`);
    }
    if (!hasCapability<ContextCompressor>(agent, "compressCommand")) {
      return textReply(
        `${active.displayName} 暂不支持上下文压缩。等待 adapter 实装 ContextCompressor capability。`
      );
    }
    const cmd = agent.compressCommand();
    return textReply(`📦 压缩指令：\`${cmd}\`\n下条消息发送该指令即可触发 ${active.displayName} 压缩当前会话。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
