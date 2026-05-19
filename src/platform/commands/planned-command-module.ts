import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";

const plannedDefinitions = [
  defineSlashCommand("delete", "/delete", "删除会话", "session", "cmd:/delete"),
  defineSlashCommand("stop", "/stop", "中止当前会话", "session", "act:/stop"),

  defineSlashCommand("model", "/model", "切换模型", "agent", "nav:/model"),
  defineSlashCommand("reasoning", "/reasoning", "切换推理强度", "agent", "nav:/reasoning"),
  defineSlashCommand("mode", "/mode", "切换运行模式", "agent", "nav:/mode"),
  defineSlashCommand("memory", "/memory", "管理记忆", "agent", "cmd:/memory"),
  defineSlashCommand("allow", "/allow", "授权工具权限", "agent", "cmd:/allow"),
  defineSlashCommand("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet"),

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
