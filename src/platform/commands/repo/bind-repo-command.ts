import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type { RepositoryStore } from "../../../repositories/repository-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { resolveBindingScopeKey, resolveBindingScopeNoun } from "./binding-scope-key.js";
import { bindRepositoryToScope, formatBoundRepoLines } from "./repo-binding.js";

export interface BindRepoCommandDeps {
  repositoryStore: RepositoryStore;
  chatBindingStore: ChatBindingStore;
}

export class BindRepoCommandHandler implements SlashCommandHandler {
  readonly id = "bind_repo";
  readonly aliases = ["bind", "bid"];

  constructor(private readonly deps: BindRepoCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const url = context.args.trim();
    if (!url) {
      return textReply("用法：/bind_repo <git url>");
    }
    const scopeKey = resolveBindingScopeKey(context);
    const { record, binding } = await bindRepositoryToScope(this.deps, scopeKey, url);
    const scopeNoun = resolveBindingScopeNoun(context);
    const repoLines = formatBoundRepoLines(this.deps.repositoryStore, binding);
    return textReply(`✅ 已为${scopeNoun}绑定仓库：${record.name} (${record.id})\n当前绑定：\n${repoLines}`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
