import type { RepositoryStore } from "../../../resources/repositories/repository-store.js";
import { isOwner } from "../../owner-access.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface RepoRemoveCommandDeps {
  repositoryStore: RepositoryStore;
  ownerEmails?: ReadonlySet<string>;
}

export class RepoRemoveCommandHandler implements SlashCommandHandler {
  readonly id = "repo_remove";
  readonly ownerOnly = true;

  constructor(private readonly deps: RepoRemoveCommandDeps) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails ?? new Set());
  }

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const query = context.args.trim();
    if (!query) {
      return textReply("用法：/repo remove <#索引|id|name|url>");
    }
    const match = this.deps.repositoryStore.findByQuery(query);
    if (!match) {
      return textReply(`未找到匹配 “${query}” 的仓库。运行 /repo list 查看。`);
    }
    const removed = await this.deps.repositoryStore.remove(match.id);
    return textReply(removed ? `✅ 已移除 ${match.name} (${match.id})` : `移除失败：${match.id}`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
