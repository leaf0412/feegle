import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type { RepositoryStore } from "../../../repositories/repository-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { resolveBindingScopeKey, resolveBindingScopeNoun } from "./binding-scope-key.js";

export interface RepoShowCommandDeps {
  repositoryStore: RepositoryStore;
  chatBindingStore: ChatBindingStore;
}

export class RepoShowCommandHandler implements SlashCommandHandler {
  readonly id = "repo_show";

  constructor(private readonly deps: RepoShowCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const scopeNoun = resolveBindingScopeNoun(context);
    const binding = this.deps.chatBindingStore.get(resolveBindingScopeKey(context));
    if (!binding) {
      return textReply(`${scopeNoun}未绑定任何仓库。运行 /bind_repo <仓库url> 绑定。`);
    }
    const lines: string[] = [`📌 ${scopeNoun}绑定`];
    if (binding.repositoryIds.length === 0) {
      lines.push("  repos:  （无）");
    } else {
      lines.push("  repos:");
      for (const id of binding.repositoryIds) {
        const repo = this.deps.repositoryStore.get(id);
        lines.push(`    - ${repo ? `${repo.name} (${id})` : `${id} (已删除)`}`);
      }
    }
    return textReply(lines.join("\n"));
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
