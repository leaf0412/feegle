import type { ChatHistoryStore } from "../../../agent/chat-history-store.js";
import type { SessionStore } from "../../../agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface SearchCommandDeps {
  sessionStore: SessionStore;
  chatHistory: ChatHistoryStore;
}

const MAX_HITS = 20;

export class SearchCommandHandler implements SlashCommandHandler {
  readonly id = "search";

  constructor(private readonly deps: SearchCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const query = context.args.trim();
    if (!query) {
      return textReply("用法：/search <关键词>");
    }
    const needle = query.toLowerCase();
    const hits: string[] = [];
    for (const session of this.deps.sessionStore.list()) {
      const messages = this.deps.chatHistory.get(session.sessionKey);
      for (const message of messages) {
        if (message.content.toLowerCase().includes(needle)) {
          const label = session.name ?? session.sessionKey;
          const snippet = snippetAround(message.content, needle);
          hits.push(`[${label}] ${message.role === "user" ? "🙋" : "🤖"} ${snippet}`);
          if (hits.length >= MAX_HITS) break;
        }
      }
      if (hits.length >= MAX_HITS) break;
    }
    if (hits.length === 0) {
      return textReply(`未找到匹配 “${query}” 的消息。`);
    }
    return textReply([`🔍 匹配 ${hits.length} 条（含截断）`, ...hits].join("\n"));
  }
}

function snippetAround(content: string, needleLower: string): string {
  const lowered = content.toLowerCase();
  const idx = lowered.indexOf(needleLower);
  if (idx < 0) return content.slice(0, 120);
  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + needleLower.length + 60);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
