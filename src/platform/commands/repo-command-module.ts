import type { SlashCommandModule } from "../slash-command-module.js";
import { defineSlashCommand } from "../slash-command-catalog.js";
import { RepoListCommandHandler } from "./repo-list-command.js";

const repoListDefinition = defineSlashCommand("repo_list", "/repo list", "列出已注册仓库", "repo", "nav:/command repo_list");
const repoDefinitions = [
  defineSlashCommand("bind", "/bind|/bid <branch> <base> [repo1 ...]", "仓库规则绑定", "repo", "nav:/command bind", ["bid"]),
  defineSlashCommand("repo_show", "/repo show", "显示当前绑定", "repo", "nav:/command repo_show"),
  defineSlashCommand("repo_clear", "/repo clear", "清除绑定", "repo", "nav:/command repo_clear"),
  defineSlashCommand("repo_add", "/repo add <url>", "注册外部仓库", "repo", "nav:/command repo_add"),
  defineSlashCommand("repo_remove", "/repo remove <#索引|url|alias|repo-key>", "删除外部仓库", "repo", "nav:/command repo_remove"),
  defineSlashCommand("repo_scan", "/repo scan", "刷新已注册仓库元数据", "repo", "nav:/command repo_scan", ["/repo sync"]),
  defineSlashCommand("workspace", "/workspace", "工作区绑定与初始化", "repo", "cmd:/workspace"),
  defineSlashCommand("dir", "/dir", "选择工作目录", "repo", "nav:/dir")
];

export function repoCommandModule(): SlashCommandModule {
  return {
    id: "repo",
    register: (registry, deps) => {
      for (const definition of repoDefinitions) {
        registry.declarePlanned(definition);
      }
      registry.registerCommand(repoListDefinition, new RepoListCommandHandler(deps.repositories));
    }
  };
}
