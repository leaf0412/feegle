import type { SlashCommandModule } from "../slash-command-module.js";
import { defineSlashCommand } from "../slash-command-catalog.js";
import { CommandDetailHandler } from "./command-detail.js";
import { HelpCommandHandler } from "./help-command.js";
import { WhoamiCommandHandler } from "./whoami-command.js";

const helpDefinition = defineSlashCommand("help", "/help", "显示帮助", "system", "nav:/help");
const whoamiDefinition = defineSlashCommand(
  "whoami",
  "/whoami",
  "查看 bot 视角下你的身份（调试用）",
  "system",
  "cmd:/whoami"
);
const systemDefinitions = [
  defineSlashCommand("ping", "/ping", "检查状态", "system", "nav:/command ping"),
  defineSlashCommand("info", "/info", "查看实例状态（网络、JVM、Worker、心跳）", "system", "nav:/command info"),
  defineSlashCommand("status", "/status", "查看状态", "system", "nav:/status"),
  defineSlashCommand("doctor", "/doctor", "运行诊断", "system", "nav:/doctor"),
  defineSlashCommand("usage", "/usage", "查看用量", "system", "cmd:/usage"),
  defineSlashCommand("version", "/version", "查看版本", "system", "nav:/version"),
  defineSlashCommand("upgrade", "/upgrade", "检查升级", "system", "nav:/upgrade"),
  defineSlashCommand("restart", "/restart", "重启服务", "system", "cmd:/restart"),
  defineSlashCommand("lang", "/lang", "切换语言", "system", "nav:/lang")
];

export function systemCommandModule(): SlashCommandModule {
  return {
    id: "system",
    register: (registry, deps) => {
      const handlerDeps = { ownerIdentities: deps.ownerIdentities, userDirectory: deps.userDirectory };
      for (const definition of systemDefinitions) {
        registry.declarePlanned(definition);
      }
      registry.registerCommand(helpDefinition, new HelpCommandHandler(registry, handlerDeps));
      registry.registerCommand(whoamiDefinition, new WhoamiCommandHandler(handlerDeps));
      registry.registerInternalHandler(new CommandDetailHandler(registry, handlerDeps));
    }
  };
}
