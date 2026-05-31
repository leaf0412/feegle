import { defaultSlashCommandModules } from "./commands/default-slash-command-modules.js";
import type { SlashCommandModule, SlashCommandRegistryDeps } from "./slash-command-module.js";
import { SlashCommandRegistry } from "./slash-command-handler.js";

export interface BuildSlashCommandRegistryOptions extends SlashCommandRegistryDeps {
  modules?: readonly SlashCommandModule[];
  defaults?: boolean;
}

/**
 * Builds the command registry from modules.
 * New commands should live behind a command module instead of editing this builder.
 * Pass `defaults: false` to skip the bundled default modules (useful when isolating
 * module-composition tests from production defaults' dep requirements).
 */
export function buildSlashCommandRegistry(deps: BuildSlashCommandRegistryOptions): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  const useDefaults = deps.defaults ?? true;
  const operatorWsId = deps.operatorWorkspaceId ?? deps.configStore?.get().defaultWorkspace;
  const baseModules = useDefaults ? defaultSlashCommandModules(operatorWsId) : [];
  for (const module of [...baseModules, ...(deps.modules ?? [])]) {
    module.register(registry, deps);
  }
  registry.freeze();
  return registry;
}
