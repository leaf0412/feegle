import type { ChatHistoryStore } from "../../../agent/chat-history-store.js";
import type { SessionStore } from "../../../agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface CurrentCommandDeps {
  sessionStore: SessionStore;
  chatHistory: ChatHistoryStore;
}

export class CurrentCommandHandler implements SlashCommandHandler {
  readonly id = "current";

  constructor(private readonly deps: CurrentCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    if (!context.sessionKey) {
      return textReply("无法识别当前会话上下文，/current 不可用。");
    }
    const session = this.deps.sessionStore.get(context.sessionKey);
    if (!session) {
      return textReply("当前会话尚未开始。直接发消息即可启动，或运行 /new 显式新建。");
    }

    const messages = this.deps.chatHistory.get(context.sessionKey);
    const lines: string[] = [`📌 当前会话`];
    lines.push(`  key: ${session.sessionKey}`);
    if (session.name) lines.push(`  名称: ${session.name}`);
    if (session.agentKind) lines.push(`  agent: ${session.agentKind}`);
    lines.push(`  状态: ${session.status}`);
    lines.push(`  消息数: ${messages.length}`);
    lines.push(`  创建于: ${session.createdAt}`);
    lines.push(`  最近活跃: ${session.lastActiveAt}`);
    return textReply(lines.join("\n"));
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
