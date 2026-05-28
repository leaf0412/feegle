import type { SlashCommandModule } from "../slash-command-module.js";
import { defineSlashCommand } from "../slash-command-catalog.js";
import { BindRepoCommandHandler } from "./repo/bind-repo-command.js";
import { UnbindRepoCommandHandler } from "./repo/unbind-repo-command.js";
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
const bindRepoDefinition = defineSlashCommand("bind_repo", "/bind_repo|/bind|/bid <url>", "绑定仓库", "repo", "nav:/command bind_repo", ["bind", "bid"]);
const unbindRepoDefinition = defineSlashCommand("unbind_repo", "/unbind_repo <url|#|name|id>", "取消绑定仓库", "repo", "nav:/command unbind_repo");

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
          bindRepoDefinition,
          new BindRepoCommandHandler({
            repositoryStore: deps.repositoryStore,
            chatBindingStore: deps.chatBindingStore
          })
        );
        registry.registerCommand(
          unbindRepoDefinition,
          new UnbindRepoCommandHandler({
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
        registry.declarePlanned(bindRepoDefinition);
        registry.declarePlanned(unbindRepoDefinition);
        registry.declarePlanned(repoShowDefinition);
        registry.declarePlanned(repoClearDefinition);
      }
    }
  };
}
