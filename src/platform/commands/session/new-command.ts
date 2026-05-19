import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import type { ChatHistoryStore } from "../../../agent/chat-history-store.js";
import type { SessionStore } from "../../../agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface NewCommandDeps {
  sessionStore: SessionStore;
  chatHistory: ChatHistoryStore;
  providers: AgentProviderRegistry;
}

export class NewCommandHandler implements SlashCommandHandler {
  readonly id = "new";

  constructor(private readonly deps: NewCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    if (!context.sessionKey) {
      return textReply("无法识别当前会话上下文，/new 不可用。");
    }
    const trimmedName = context.args.trim();
    const name = trimmedName.length > 0 ? trimmedName : undefined;

    this.deps.chatHistory.clear(context.sessionKey);

    const existing = this.deps.sessionStore.get(context.sessionKey);
    if (existing) {
      await this.deps.sessionStore.remove(context.sessionKey);
    }

    const agentKind = this.deps.providers.activeKindName();
    await this.deps.sessionStore.getOrCreate(context.sessionKey, {
      ...(agentKind ? { agentKind } : {}),
      ...(name ? { name } : {})
    });

    const label = name ? `“${name}”` : "新会话";
    return textReply(`✅ 已开始${label}。历史已清空，开始下一轮对话吧。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
