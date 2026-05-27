import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { resolveBindingScopeKey, resolveBindingScopeNoun } from "./binding-scope-key.js";

export interface RepoClearCommandDeps {
  chatBindingStore: ChatBindingStore;
}

export class RepoClearCommandHandler implements SlashCommandHandler {
  readonly id = "repo_clear";

  constructor(private readonly deps: RepoClearCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const scopeNoun = resolveBindingScopeNoun(context);
    const removed = await this.deps.chatBindingStore.clear(resolveBindingScopeKey(context));
    return textReply(removed ? `✅ 已清除${scopeNoun}的仓库绑定。` : `${scopeNoun}没有绑定，无需清除。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
