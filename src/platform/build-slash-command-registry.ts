import { defaultSlashCommandModules } from "./commands/default-slash-command-modules.js";
import type { SlashCommandModule, SlashCommandRegistryDeps } from "./slash-command-module.js";
import { SlashCommandRegistry } from "./slash-command-handler.js";

export interface BuildSlashCommandRegistryOptions extends SlashCommandRegistryDeps {
  modules?: readonly SlashCommandModule[];
}

/**
 * Builds the command registry from modules.
 * New commands should live behind a command module instead of editing this builder.
 */
export function buildSlashCommandRegistry(deps: BuildSlashCommandRegistryOptions): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  for (const module of [...defaultSlashCommandModules(), ...(deps.modules ?? [])]) {
    module.register(registry, deps);
  }
  return registry;
}
