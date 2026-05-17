import type { RepositoryRecord } from "../../domain/models.js";
import type { SlashCommandHandler, SlashCommandReply } from "../slash-command-handler.js";

export interface RepositoryListSource {
  list(): RepositoryRecord[];
}

export class RepoListCommandHandler implements SlashCommandHandler {
  readonly id = "repo_list";

  constructor(private readonly repositories: RepositoryListSource) {}

  async execute(): Promise<SlashCommandReply> {
    const records = this.repositories.list();
    return { kind: "text", text: renderRepositoryList(records) };
  }
}

function renderRepositoryList(repositories: ReadonlyArray<RepositoryRecord>): string {
  if (repositories.length === 0) {
    return "暂无已注册仓库。";
  }
  return [
    "已注册仓库：",
    ...repositories.map((repository, index) =>
      `${index + 1}. ${repository.name} (${repository.id}) · ${repository.defaultBaseBranch} · ${repository.remoteUrl}`
    )
  ].join("\n");
}
