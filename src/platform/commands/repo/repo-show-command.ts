import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type { RepositoryStore } from "../../../repositories/repository-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface RepoShowCommandDeps {
  repositoryStore: RepositoryStore;
  chatBindingStore: ChatBindingStore;
}

export class RepoShowCommandHandler implements SlashCommandHandler {
  readonly id = "repo_show";

  constructor(private readonly deps: RepoShowCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const binding = this.deps.chatBindingStore.get(context.chatId);
    if (!binding) {
      return textReply("当前 chat 未绑定任何仓库。运行 /bind <branch> <base> <repo...> 设置。");
    }
    const lines: string[] = ["📌 当前 chat 绑定"];
    if (binding.branch) lines.push(`  branch: ${binding.branch}`);
    if (binding.baseBranch) lines.push(`  base:   ${binding.baseBranch}`);
    if (binding.workspaceId) lines.push(`  workspace: ${binding.workspaceId}`);
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
