import type { RepositoryStore } from "../../../repositories/repository-store.js";
import { isOwner } from "../../owner-access.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { detectDefaultBranch } from "./repo-add-command.js";

export interface RepoScanCommandDeps {
  repositoryStore: RepositoryStore;
  ownerEmails?: ReadonlySet<string>;
}

export class RepoScanCommandHandler implements SlashCommandHandler {
  readonly id = "repo_scan";
  readonly ownerOnly = true;

  constructor(private readonly deps: RepoScanCommandDeps) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails ?? new Set());
  }

  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    const repos = this.deps.repositoryStore.list();
    if (repos.length === 0) {
      return textReply("还没有注册仓库。运行 /repo add <url> 先注册。");
    }
    const lines: string[] = ["🔁 刷新仓库元数据"];
    for (const repo of repos) {
      try {
        const branch = await detectDefaultBranch(repo.remoteUrl);
        if (branch !== repo.defaultBaseBranch) {
          await this.deps.repositoryStore.update(repo.id, { defaultBaseBranch: branch });
          lines.push(`  ✏️ ${repo.name}: default ${repo.defaultBaseBranch} → ${branch}`);
        } else {
          lines.push(`  ✅ ${repo.name}: ${branch}`);
        }
      } catch (error) {
        lines.push(`  ❌ ${repo.name}: ${errorMessage(error)}`);
      }
    }
    return textReply(lines.join("\n"));
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
