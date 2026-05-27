import type { ChatBindingStore } from "../../../repositories/chat-binding-store.js";
import type { RepositoryStore } from "../../../repositories/repository-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { resolveBindingScopeKey, resolveBindingScopeNoun } from "./binding-scope-key.js";

export interface BindCommandDeps {
  repositoryStore: RepositoryStore;
  chatBindingStore: ChatBindingStore;
}

export class BindCommandHandler implements SlashCommandHandler {
  readonly id = "bind";
  readonly aliases = ["bid"];

  constructor(private readonly deps: BindCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const parts = context.args.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return textReply("用法：/bind <branch> <base> [repo#1|name|id ...]");
    }
    const [branch, baseBranch, ...repoQueries] = parts;
    const repositoryIds: string[] = [];
    const missing: string[] = [];
    for (const query of repoQueries) {
      const record = this.deps.repositoryStore.findByQuery(query!);
      if (record) {
        repositoryIds.push(record.id);
      } else {
        missing.push(query!);
      }
    }
    if (missing.length > 0) {
      return textReply(`未识别的仓库：${missing.join(", ")}。运行 /repo list 查看可用。`);
    }
    const scopeKey = resolveBindingScopeKey(context);
    const binding = await this.deps.chatBindingStore.upsert({
      chatId: scopeKey,
      branch: branch!,
      baseBranch: baseBranch!,
      repositoryIds
    });
    const repoLabel = binding.repositoryIds.length > 0 ? binding.repositoryIds.join(", ") : "（无指定仓库）";
    const scopeNoun = resolveBindingScopeNoun(context);
    return textReply(
      `✅ ${scopeNoun}已绑定：\n  branch: ${binding.branch}\n  base:   ${binding.baseBranch}\n  repos:  ${repoLabel}`
    );
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}
