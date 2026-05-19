import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";
import { AliasCommandHandler } from "./setup/alias-command.js";
import { ConfigCommandHandler } from "./setup/config-command.js";

const configDefinition = defineSlashCommand("config", "/config", "查看运行配置", "setup", "nav:/config");
const aliasDefinition = defineSlashCommand("alias", "/alias", "管理命令别名", "setup", "nav:/alias");

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

      if (deps.aliasStore) {
        registry.registerCommand(aliasDefinition, new AliasCommandHandler({ aliasStore: deps.aliasStore }));
      } else {
        registry.declarePlanned(aliasDefinition);
      }
    }
  };
}
