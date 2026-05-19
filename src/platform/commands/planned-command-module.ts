import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";

const plannedDefinitions = [


  defineSlashCommand("alias", "/alias", "管理命令别名", "setup", "nav:/alias"),

  defineSlashCommand("shell", "/shell", "执行 shell 工具", "knowledge", "cmd:/shell")
];

export function plannedCommandModule(): SlashCommandModule {
  return {
    id: "planned",
    register: (registry) => {
      for (const definition of plannedDefinitions) {
        registry.declarePlanned(definition);
      }
    }
  };
}
