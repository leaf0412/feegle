import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface RepoClearCommandDeps {
  chatBindingStore: ChatBindingStore;
}

export class RepoClearCommandHandler implements SlashCommandHandler {
  readonly id = "repo_clear";

  constructor(private readonly deps: RepoClearCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const removed = await this.deps.chatBindingStore.clear(context.chatId);
    return textReply(removed ? "✅ 已清除当前 chat 的仓库绑定。" : "当前 chat 没有绑定，无需清除。");
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
