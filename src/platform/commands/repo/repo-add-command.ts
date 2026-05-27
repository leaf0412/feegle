import { execa } from "execa";
import type { RepositoryStore } from "../../../repositories/repository-store.js";
import { isOwner } from "../../owner-access.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { deriveRepositoryName } from "./repo-url.js";

export interface RepoAddCommandDeps {
  repositoryStore: RepositoryStore;
  ownerEmails?: ReadonlySet<string>;
}

export class RepoAddCommandHandler implements SlashCommandHandler {
  readonly id = "repo_add";
  readonly ownerOnly = true;

  constructor(private readonly deps: RepoAddCommandDeps) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails ?? new Set());
  }

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const url = context.args.trim();
    if (!url) {
      return textReply("用法：/repo add <git url>");
    }
    const existing = this.deps.repositoryStore.findByUrl(url);
    if (existing) {
      return textReply(`仓库已注册：${existing.name} (${existing.id})`);
    }
    let defaultBranch = "main";
    try {
      defaultBranch = await detectDefaultBranch(url);
    } catch (error) {
      return textReply(`无法访问 git 远端: ${errorMessage(error)}`);
    }
    const name = deriveRepositoryName(url);
    const record = await this.deps.repositoryStore.add({
      name,
      remoteUrl: url,
      defaultBaseBranch: defaultBranch
    });
    return textReply(`✅ 已注册 ${record.name} (${record.id}) · default branch: ${defaultBranch}`);
  }
}

export async function detectDefaultBranch(url: string): Promise<string> {
  const { stdout } = await execa("git", ["ls-remote", "--symref", url, "HEAD"], { timeout: 30_000 });
  const match = /ref:\s+refs\/heads\/(\S+)\s+HEAD/.exec(stdout);
  if (match && match[1]) return match[1];
  return "main";
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
