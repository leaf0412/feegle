import type { SlashCommandModule } from "../slash-command-module.js";
import { RepoListCommandHandler } from "./repo-list-command.js";

export function repoCommandModule(): SlashCommandModule {
  return {
    id: "repo",
    register: (registry, deps) => {
      registry.register(new RepoListCommandHandler(deps.repositories));
    }
  };
}
