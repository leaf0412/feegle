import type { SessionStore } from "../../../agent/session-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface NameCommandDeps {
  sessionStore: SessionStore;
}

export class NameCommandHandler implements SlashCommandHandler {
  readonly id = "name";

  constructor(private readonly deps: NameCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    if (!context.sessionKey) {
      return textReply("无法识别当前会话上下文，/name 不可用。");
    }
    const newName = context.args.trim();
    if (!newName) {
      return textReply("用法：/name <新名称>");
    }
    const session = this.deps.sessionStore.get(context.sessionKey);
    if (!session) {
      return textReply("当前会话尚未开始，先发一条消息或运行 /new。");
    }
    const updated = await this.deps.sessionStore.rename(context.sessionKey, newName);
    return textReply(`✅ 会话已更名为 “${updated.name}”。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
