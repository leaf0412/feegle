import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type { RepositoryStore } from "../../../repositories/repository-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { resolveBindingScopeKey, resolveBindingScopeNoun } from "./binding-scope-key.js";

export interface UnbindRepoCommandDeps {
  repositoryStore: RepositoryStore;
  chatBindingStore: ChatBindingStore;
}

export class UnbindRepoCommandHandler implements SlashCommandHandler {
  readonly id = "unbind_repo";

  constructor(private readonly deps: UnbindRepoCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const query = context.args.trim();
    if (!query) {
      return textReply("用法：/unbind_repo <url|#索引|name|id>");
    }
    const record = this.deps.repositoryStore.findByQuery(query);
    if (!record) {
      return textReply(`未识别的仓库：${query}。运行 /repo show 查看已绑定。`);
    }
    const scopeNoun = resolveBindingScopeNoun(context);
    const { removed } = await this.deps.chatBindingStore.removeRepository(
      resolveBindingScopeKey(context),
      record.id
    );
    return textReply(removed ? `✅ 已取消绑定 ${record.name}` : `${record.name} 未在${scopeNoun}绑定中。`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
