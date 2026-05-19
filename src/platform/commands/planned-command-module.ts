import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";

const plannedDefinitions = [
  defineSlashCommand("stop", "/stop", "中止当前会话", "session", "act:/stop"),


  defineSlashCommand("commands", "/commands", "管理自定义命令", "setup", "nav:/commands"),
  defineSlashCommand("alias", "/alias", "管理命令别名", "setup", "nav:/alias"),
  defineSlashCommand("skills", "/skills", "查看技能目录", "setup", "nav:/skills"),

  defineSlashCommand("shell", "/shell", "执行 shell 工具", "knowledge", "cmd:/shell"),
  defineSlashCommand("show", "/show", "展示文件或结果", "knowledge", "cmd:/show"),
  defineSlashCommand("compress", "/compress", "压缩上下文", "knowledge", "cmd:/compress")
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
