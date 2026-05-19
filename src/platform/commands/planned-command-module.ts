import { defineSlashCommand } from "../slash-command-catalog.js";
import type { SlashCommandModule } from "../slash-command-module.js";

const plannedDefinitions = [
  defineSlashCommand("new", "/new", "创建新会话", "session", "act:/new"),
  defineSlashCommand("list", "/list", "查看会话列表", "session", "nav:/list"),
  defineSlashCommand("current", "/current", "查看当前会话", "session", "nav:/current"),
  defineSlashCommand("switch", "/switch", "切换会话", "session", "nav:/list"),
  defineSlashCommand("search", "/search", "搜索历史会话", "session", "cmd:/search"),
  defineSlashCommand("history", "/history", "查看会话历史", "session", "nav:/history"),
  defineSlashCommand("delete", "/delete", "删除会话", "session", "cmd:/delete"),
  defineSlashCommand("name", "/name", "重命名会话", "session", "cmd:/name"),
  defineSlashCommand("sessions", "/sessions", "查看活跃交互会话", "session", "nav:/command sessions"),
  defineSlashCommand("exit", "/exit", "退出交互会话", "session", "nav:/command exit"),
  defineSlashCommand("clear", "/clear", "清空对话历史", "session", "nav:/command clear"),
  defineSlashCommand("stop", "/stop", "中止当前会话", "session", "act:/stop"),

  defineSlashCommand("model", "/model", "切换模型", "agent", "nav:/model"),
  defineSlashCommand("reasoning", "/reasoning", "切换推理强度", "agent", "nav:/reasoning"),
  defineSlashCommand("mode", "/mode", "切换运行模式", "agent", "nav:/mode"),
  defineSlashCommand("memory", "/memory", "管理记忆", "agent", "cmd:/memory"),
  defineSlashCommand("allow", "/allow", "授权工具权限", "agent", "cmd:/allow"),
  defineSlashCommand("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet"),
  defineSlashCommand("tts", "/tts", "切换语音播报", "agent", "cmd:/tts"),
  defineSlashCommand("claude", "/claude <消息>", "跳过 light pilot，强制使用 Claude Code", "agent", "nav:/command claude"),
  defineSlashCommand("codex", "/codex <消息>", "跳过 light pilot，强制使用 Codex", "agent", "nav:/command codex"),

  defineSlashCommand("setup", "/setup", "开始项目配置", "setup", "nav:/command setup"),
  defineSlashCommand("confirm", "/confirm", "确认配置", "setup", "nav:/command confirm"),
  defineSlashCommand("cancel", "/cancel", "取消配置", "setup", "nav:/command cancel"),
  defineSlashCommand("ctx", "/ctx set|show|clear|list", "管理群聊上下文", "setup", "nav:/command ctx"),
  defineSlashCommand("config", "/config", "查看运行配置", "setup", "nav:/config"),
  defineSlashCommand("commands", "/commands", "管理自定义命令", "setup", "nav:/commands"),
  defineSlashCommand("alias", "/alias", "管理命令别名", "setup", "nav:/alias"),
  defineSlashCommand("skills", "/skills", "查看技能目录", "setup", "nav:/skills"),

  defineSlashCommand("note_add", "/note_add <内容>", "新增笔记（仅 admin）", "knowledge", "nav:/command note_add"),
  defineSlashCommand("note_find", "/note_find [10-20] <关键词>", "检索笔记（仅 admin）", "knowledge", "nav:/command note_find"),
  defineSlashCommand("note_recent", "/note_recent [10-20]", "最近笔记，默认 20 条（仅 admin）", "knowledge", "nav:/command note_recent"),
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
