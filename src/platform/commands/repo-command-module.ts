import type { SlashCommandModule } from "../slash-command-module.js";
import { defineSlashCommand } from "../slash-command-catalog.js";
import { BindCommandHandler } from "./repo/bind-command.js";
import { RepoAddCommandHandler } from "./repo/repo-add-command.js";
import { RepoClearCommandHandler } from "./repo/repo-clear-command.js";
import { RepoListCommandHandler } from "./repo-list-command.js";
import { RepoRemoveCommandHandler } from "./repo/repo-remove-command.js";
import { RepoScanCommandHandler } from "./repo/repo-scan-command.js";
import { RepoShowCommandHandler } from "./repo/repo-show-command.js";

const repoListDefinition = defineSlashCommand("repo_list", "/repo list", "列出已注册仓库", "repo", "nav:/command repo_list");
const repoAddDefinition = defineSlashCommand("repo_add", "/repo add <url>", "注册外部仓库", "repo", "nav:/command repo_add");
const repoRemoveDefinition = defineSlashCommand("repo_remove", "/repo remove <#索引|url|alias|repo-key>", "删除外部仓库", "repo", "nav:/command repo_remove");
const repoScanDefinition = defineSlashCommand("repo_scan", "/repo scan", "刷新已注册仓库元数据", "repo", "nav:/command repo_scan", ["/repo sync"]);
const repoShowDefinition = defineSlashCommand("repo_show", "/repo show", "显示当前绑定", "repo", "nav:/command repo_show");
const repoClearDefinition = defineSlashCommand("repo_clear", "/repo clear", "清除绑定", "repo", "nav:/command repo_clear");
const bindDefinition = defineSlashCommand("bind", "/bind|/bid <branch> <base> [repo1 ...]", "仓库规则绑定", "repo", "nav:/command bind", ["bid"]);

export function repoCommandModule(): SlashCommandModule {
  return {
    id: "repo",
    register: (registry, deps) => {
      registry.registerCommand(repoListDefinition, new RepoListCommandHandler(deps.repositories));

      if (deps.repositoryStore) {
        registry.registerCommand(
          repoAddDefinition,
          new RepoAddCommandHandler({ repositoryStore: deps.repositoryStore, ownerEmails: deps.ownerEmails })
        );
        registry.registerCommand(
          repoRemoveDefinition,
          new RepoRemoveCommandHandler({ repositoryStore: deps.repositoryStore, ownerEmails: deps.ownerEmails })
        );
        registry.registerCommand(
          repoScanDefinition,
          new RepoScanCommandHandler({ repositoryStore: deps.repositoryStore, ownerEmails: deps.ownerEmails })
        );
      } else {
        registry.declarePlanned(repoAddDefinition);
        registry.declarePlanned(repoRemoveDefinition);
        registry.declarePlanned(repoScanDefinition);
      }

      if (deps.repositoryStore && deps.chatBindingStore) {
        registry.registerCommand(
          bindDefinition,
          new BindCommandHandler({
            repositoryStore: deps.repositoryStore,
            chatBindingStore: deps.chatBindingStore
          })
        );
        registry.registerCommand(
          repoShowDefinition,
          new RepoShowCommandHandler({
            repositoryStore: deps.repositoryStore,
            chatBindingStore: deps.chatBindingStore
          })
        );
        registry.registerCommand(
          repoClearDefinition,
          new RepoClearCommandHandler({ chatBindingStore: deps.chatBindingStore })
        );
      } else {
        registry.declarePlanned(bindDefinition);
        registry.declarePlanned(repoShowDefinition);
        registry.declarePlanned(repoClearDefinition);
      }
    }
  };
}
