import type { ChatHistoryStore } from "@integrations/agent/chat-history-store.js";
import type { SessionStore, SessionRecord } from "@integrations/agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface ListCommandDeps {
  sessionStore: SessionStore;
  chatHistory: ChatHistoryStore;
}

export class ListCommandHandler implements SlashCommandHandler {
  readonly id = "list";

  constructor(private readonly deps: ListCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const prefix = chatPrefix(context);
    if (!prefix) {
      return textReply("无法识别当前 chat 上下文，/list 不可用。");
    }
    const sessions = this.deps.sessionStore.listByPrefix(prefix);
    if (sessions.length === 0) {
      return textReply("当前 chat 还没有任何会话。直接发消息即可启动一个。");
    }
    const sorted = [...sessions].sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
    const lines: string[] = [`📚 当前 chat 会话列表（${sorted.length}）`];
    for (const session of sorted) {
      lines.push(formatSession(session, this.deps.chatHistory, context.sessionKey));
    }
    return textReply(lines.join("\n"));
  }
}

function formatSession(session: SessionRecord, history: ChatHistoryStore, currentKey?: string): string {
  const marker = session.sessionKey === currentKey ? "▶" : "◻";
  const label = session.name ?? "(unnamed)";
  const agent = session.agentKind ? ` · ${session.agentKind}` : "";
  const msgs = history.get(session.sessionKey).length;
  return `${marker} ${label}${agent} · ${msgs} msgs · ${session.status} · ${session.lastActiveAt}`;
}

function chatPrefix(context: SlashCommandContext): string | undefined {
  if (context.sessionKey) {
    const parts = context.sessionKey.split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:`;
    }
  }
  if (context.chatId) {
    return `${context.sender.platform}:${context.chatId}:`;
  }
  return undefined;
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
