import { CommandDetailHandler } from "./commands/command-detail.js";
import { HelpCommandHandler } from "./commands/help-command.js";
import { RepoListCommandHandler, type RepositoryListSource } from "./commands/repo-list-command.js";
import { SlashCommandRegistry } from "./slash-command-handler.js";

export interface SlashCommandRegistryDeps {
  repositories: RepositoryListSource;
}

/**
 * Wire the implemented slash command handlers into a registry.
 *
 * New commands register here exactly once. The responder never grows
 * an if-else per command.
 */
export function buildSlashCommandRegistry(deps: SlashCommandRegistryDeps): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  registry.register(new HelpCommandHandler(registry));
  registry.register(new CommandDetailHandler(registry));
  registry.register(new RepoListCommandHandler(deps.repositories));
  return registry;
}
