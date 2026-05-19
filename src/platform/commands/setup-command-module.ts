import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { ConfigCommandHandler } from "./setup/config-command.js";

const configDefinition = defineSlashCommand("config", "/config", "查看运行配置", "setup", "nav:/config");

export function setupCommandModule(): SlashCommandModule {
  return {
    id: "setup",
    register: (registry, deps) => {
      if (deps.configStore && deps.providers) {
        registry.registerCommand(
          configDefinition,
          new ConfigCommandHandler({
            configStore: deps.configStore,
            providers: deps.providers
          })
        );
      } else {
        registry.declarePlanned(configDefinition);
      }
    }
  };
}
