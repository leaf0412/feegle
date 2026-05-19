import type { ChatHistoryStore } from "../../../agent/chat-history-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface HistoryCommandDeps {
  chatHistory: ChatHistoryStore;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class HistoryCommandHandler implements SlashCommandHandler {
  readonly id = "history";

  constructor(private readonly deps: HistoryCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    if (!context.sessionKey) {
      return textReply("无法识别当前会话上下文，/history 不可用。");
    }
    const limit = parseLimit(context.args);
    const messages = this.deps.chatHistory.get(context.sessionKey);
    if (messages.length === 0) {
      return textReply("当前会话还没有消息。");
    }
    const slice = messages.slice(-limit);
    const lines: string[] = [`💬 最近 ${slice.length} 条消息（共 ${messages.length}）`];
    for (const message of slice) {
      const roleIcon = message.role === "user" ? "🙋" : "🤖";
      const truncated = message.content.length > 240 ? message.content.slice(0, 240) + "…" : message.content;
      lines.push(`${roleIcon} ${truncated}`);
    }
    return textReply(lines.join("\n"));
  }
}

function parseLimit(args: string): number {
  const trimmed = args.trim();
  if (trimmed === "") return DEFAULT_LIMIT;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
