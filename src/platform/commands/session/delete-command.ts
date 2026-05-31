import type { ChatHistoryStore } from "@integrations/agent/chat-history-store.js";
import type { SessionStore } from "@integrations/agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface DeleteCommandDeps {
  sessionStore: SessionStore;
  chatHistory: ChatHistoryStore;
}

export class DeleteCommandHandler implements SlashCommandHandler {
  readonly id = "delete";

  constructor(private readonly deps: DeleteCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    if (!context.sessionKey) {
      return textReply("无法识别当前会话上下文，/delete 不可用。");
    }
    const session = this.deps.sessionStore.get(context.sessionKey);
    if (!session) {
      return textReply("当前会话不存在，无需删除。");
    }
    const confirmation = context.args.trim().toLowerCase();
    if (confirmation !== "confirm") {
      const label = session.name ?? session.sessionKey;
      return textReply(
        `⚠️ 即将删除会话 “${label}”（消息也会被清空）。\n确认请运行：/delete confirm`
      );
    }
    this.deps.chatHistory.clear(context.sessionKey);
    await this.deps.sessionStore.remove(context.sessionKey);
    return textReply(`✅ 已删除会话。后续发消息会自动新建。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
