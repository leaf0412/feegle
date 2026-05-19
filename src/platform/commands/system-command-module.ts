import type { SlashCommandModule } from "../slash-command-module.js";
import { defineSlashCommand } from "../slash-command-catalog.js";
import { CommandDetailHandler } from "./command-detail.js";
import { HelpCommandHandler } from "./help-command.js";
import { StatusCommandHandler } from "./system/status-command.js";
import { VersionCommandHandler } from "./system/version-command.js";
import { WhoamiCommandHandler } from "./whoami-command.js";

const helpDefinition = defineSlashCommand("help", "/help", "显示帮助", "system", "nav:/help");
const whoamiDefinition = defineSlashCommand(
  "whoami",
  "/whoami",
  "查看 bot 视角下你的身份（调试用）",
  "system",
  "cmd:/whoami"
);
const versionDefinition = defineSlashCommand("version", "/version", "查看版本", "system", "nav:/version");
const statusDefinition = defineSlashCommand("status", "/status", "查看状态", "system", "nav:/status");
const plannedSystemDefinitions = [
  defineSlashCommand("doctor", "/doctor", "运行诊断", "system", "nav:/doctor"),
  defineSlashCommand("usage", "/usage", "查看用量", "system", "cmd:/usage"),
  defineSlashCommand("upgrade", "/upgrade", "检查升级", "system", "nav:/upgrade"),
  defineSlashCommand("restart", "/restart", "重启服务", "system", "cmd:/restart")
];

export function systemCommandModule(): SlashCommandModule {
  return {
    id: "system",
    register: (registry, deps) => {
      const handlerDeps = { ownerEmails: deps.ownerEmails, userDirectory: deps.userDirectory };
      for (const definition of plannedSystemDefinitions) {
        registry.declarePlanned(definition);
      }
      registry.registerCommand(helpDefinition, new HelpCommandHandler(registry, handlerDeps));
      registry.registerCommand(whoamiDefinition, new WhoamiCommandHandler(handlerDeps));
      registry.registerCommand(versionDefinition, new VersionCommandHandler());

      if (deps.taskRegistry && deps.providers) {
        registry.registerCommand(
          statusDefinition,
          new StatusCommandHandler({
            taskRegistry: deps.taskRegistry,
            providers: deps.providers,
            runsLog: deps.runsLog
          })
        );
      } else {
        registry.declarePlanned(statusDefinition);
      }

      registry.registerInternalHandler(new CommandDetailHandler(registry, handlerDeps));
    }
  };
}
