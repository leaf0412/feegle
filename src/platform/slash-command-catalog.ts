export interface SlashCommandGroup {
  key: string;
  title: string;
}

export interface SlashCommandDefinition {
  id: string;
  command: string;
  description: string;
  groupKey: string;
  action: string;
  aliases?: string[];
  detail?: string;
}

export const defaultSlashCommandGroupKey = "session";

export const slashCommandGroups: SlashCommandGroup[] = [
  { key: "session", title: "会话" },
  { key: "agent", title: "Agent" },
  { key: "repo", title: "仓库" },
  { key: "cron", title: "定时任务" },
  { key: "stock", title: "股票" },
  { key: "setup", title: "配置" },
  { key: "knowledge", title: "知识" },
  { key: "system", title: "系统" }
];

export const slashCommands: SlashCommandDefinition[] = [
  cmd("new", "/new", "创建新会话", "session", "act:/new"),
  cmd("list", "/list", "查看会话列表", "session", "nav:/list"),
  cmd("current", "/current", "查看当前会话", "session", "nav:/current"),
  cmd("switch", "/switch", "切换会话", "session", "nav:/list"),
  cmd("search", "/search", "搜索历史会话", "session", "cmd:/search"),
  cmd("history", "/history", "查看会话历史", "session", "nav:/history"),
  cmd("delete", "/delete", "删除会话", "session", "cmd:/delete"),
  cmd("name", "/name", "重命名会话", "session", "cmd:/name"),
  cmd("sessions", "/sessions", "查看活跃交互会话", "session", "nav:/command sessions"),
  cmd("exit", "/exit", "退出交互会话", "session", "nav:/command exit"),
  cmd("clear", "/clear", "清空对话历史", "session", "nav:/command clear"),
  cmd("stop", "/stop", "中止当前会话", "session", "act:/stop"),

  cmd("model", "/model", "切换模型", "agent", "nav:/model"),
  cmd("reasoning", "/reasoning", "切换推理强度", "agent", "nav:/reasoning"),
  cmd("mode", "/mode", "切换运行模式", "agent", "nav:/mode"),
  cmd("provider", "/provider", "管理模型提供方", "agent", "nav:/provider"),
  cmd("memory", "/memory", "管理记忆", "agent", "cmd:/memory"),
  cmd("allow", "/allow", "授权工具权限", "agent", "cmd:/allow"),
  cmd("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet"),
  cmd("tts", "/tts", "切换语音播报", "agent", "cmd:/tts"),
  cmd("claude", "/claude <消息>", "跳过 light pilot，强制使用 Claude Code", "agent", "nav:/command claude"),
  cmd("codex", "/codex <消息>", "跳过 light pilot，强制使用 Codex", "agent", "nav:/command codex"),

  cmd("bind", "/bind|/bid <branch> <base> [repo1 ...]", "仓库规则绑定", "repo", "nav:/command bind", ["bid"]),
  cmd("repo_show", "/repo show", "显示当前绑定", "repo", "nav:/command repo_show"),
  cmd("repo_clear", "/repo clear", "清除绑定", "repo", "nav:/command repo_clear"),
  cmd("repo_list", "/repo list", "列出已注册仓库", "repo", "nav:/command repo_list"),
  cmd("repo_add", "/repo add <url>", "注册外部仓库", "repo", "nav:/command repo_add"),
  cmd("repo_remove", "/repo remove <#索引|url|alias|repo-key>", "删除外部仓库", "repo", "nav:/command repo_remove"),
  cmd("repo_scan", "/repo scan", "刷新已注册仓库元数据", "repo", "nav:/command repo_scan", ["/repo sync"]),
  cmd("shifu", "/shifu bind|show|unbind|sync", "shifu 同步管理", "repo", "nav:/command shifu"),
  cmd("workspace", "/workspace", "工作区绑定与初始化", "repo", "cmd:/workspace"),
  cmd("dir", "/dir", "选择工作目录", "repo", "nav:/dir"),

  cmd("setup", "/setup", "开始项目配置", "setup", "nav:/command setup"),
  cmd("confirm", "/confirm", "确认配置", "setup", "nav:/command confirm"),
  cmd("cancel", "/cancel", "取消配置", "setup", "nav:/command cancel"),
  cmd("ctx", "/ctx set|show|clear|list", "管理群聊上下文", "setup", "nav:/command ctx"),
  cmd("config", "/config", "查看运行配置", "setup", "nav:/config"),
  cmd("commands", "/commands", "管理自定义命令", "setup", "nav:/commands"),
  cmd("alias", "/alias", "管理命令别名", "setup", "nav:/alias"),
  cmd("skills", "/skills", "查看技能目录", "setup", "nav:/skills"),

  cmd("note_add", "/note_add <内容>", "新增笔记（仅 admin）", "knowledge", "nav:/command note_add"),
  cmd("note_find", "/note_find [10-20] <关键词>", "检索笔记（仅 admin）", "knowledge", "nav:/command note_find"),
  cmd("note_recent", "/note_recent [10-20]", "最近笔记，默认 20 条（仅 admin）", "knowledge", "nav:/command note_recent"),
  cmd("shell", "/shell", "执行 shell 工具", "knowledge", "cmd:/shell"),
  cmd("show", "/show", "展示文件或结果", "knowledge", "cmd:/show"),
  cmd("compress", "/compress", "压缩上下文", "knowledge", "cmd:/compress"),

  cmd("cron_list", "/cron list", "列出所有任务", "cron", "cmd:/cron list"),
  cmd("cron_show", "/cron show <id>", "查看任务详情", "cron", "cmd:/cron show"),
  cmd("cron_add", "/cron add <kind> <cron> [k=v…]", "创建任务", "cron", "cmd:/cron add"),
  cmd("cron_edit", "/cron edit <id> [k=v…]", "修改任务", "cron", "cmd:/cron edit"),
  cmd("cron_remove", "/cron remove <id>", "删除任务", "cron", "cmd:/cron remove"),
  cmd("cron_pause", "/cron pause <id>", "暂停任务", "cron", "cmd:/cron pause"),
  cmd("cron_resume", "/cron resume <id>", "恢复任务", "cron", "cmd:/cron resume"),
  cmd("cron_run_now", "/cron run-now <id> [--force]", "立刻触发", "cron", "cmd:/cron run-now"),
  cmd("cron_set_target", "/cron set-target <id> [chatId]", "设置任务通知群", "cron", "cmd:/cron set-target"),
  cmd("cron_history", "/cron history <id> [--last N]", "查看运行历史", "cron", "cmd:/cron history"),

  cmd("bind_stocks", "/bind_stocks <codes>", "订阅股票监控", "stock", "cmd:/bind_stocks"),
  cmd("unbind_stocks", "/unbind_stocks <codes>", "取消订阅", "stock", "cmd:/unbind_stocks"),
  cmd("stocks", "/stocks [codes]", "即时查询", "stock", "cmd:/stocks"),
  cmd("portfolio_set", "/portfolio set <code> k=v…", "设置持仓", "stock", "cmd:/portfolio set"),
  cmd("portfolio_list", "/portfolio list", "查看持仓", "stock", "cmd:/portfolio list"),
  cmd("portfolio_clear", "/portfolio clear <code>", "清除某条持仓", "stock", "cmd:/portfolio clear"),
  cmd("portfolio_unset", "/portfolio unset <code> <field>", "清空某字段", "stock", "cmd:/portfolio unset"),

  cmd("error_target_set", "/error_target set", "绑定故障通知群", "setup", "cmd:/error_target set"),
  cmd("error_target_show", "/error_target show", "查看故障通知群", "setup", "cmd:/error_target show"),
  cmd("error_target_clear", "/error_target clear", "解绑故障通知群", "setup", "cmd:/error_target clear"),

  cmd("ping", "/ping", "检查状态", "system", "nav:/command ping"),
  cmd("info", "/info", "查看实例状态（网络、JVM、Worker、心跳）", "system", "nav:/command info"),
  cmd("status", "/status", "查看状态", "system", "nav:/status"),
  cmd("doctor", "/doctor", "运行诊断", "system", "nav:/doctor"),
  cmd("usage", "/usage", "查看用量", "system", "cmd:/usage"),
  cmd("version", "/version", "查看版本", "system", "nav:/version"),
  cmd("upgrade", "/upgrade", "检查升级", "system", "nav:/upgrade"),
  cmd("restart", "/restart", "重启服务", "system", "cmd:/restart"),
  cmd("lang", "/lang", "切换语言", "system", "nav:/lang"),
  cmd("help", "/help", "显示帮助", "system", "nav:/help")
];

export function listSlashCommandGroups(): SlashCommandGroup[] {
  return slashCommandGroups.map((group) => ({ ...group }));
}

export function listSlashCommands(groupKey?: string): SlashCommandDefinition[] {
  return slashCommands.filter((command) => !groupKey || command.groupKey === groupKey).map(cloneCommand);
}

export function findSlashCommandById(id: string): SlashCommandDefinition | undefined {
  const normalizedId = id.trim();
  return slashCommands.find((command) => command.id === normalizedId || command.aliases?.includes(normalizedId));
}

export function findSlashCommandByInput(input: string): SlashCommandDefinition | undefined {
  const normalized = normalizeCommandInput(input);
  return slashCommands.find((command) => commandMatches(command, normalized));
}

function commandMatches(command: SlashCommandDefinition, normalizedInput: string): boolean {
  return commandPatterns(command).some((pattern) => inputMatchesPattern(normalizedInput, pattern));
}

function normalizeCommandInput(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function commandPatterns(command: SlashCommandDefinition): string[] {
  const primaryPatterns = command.command.split("|").map((part) => literalCommandPrefix(part));
  const aliasPatterns = command.aliases?.map(literalCommandPrefix) ?? [];
  return [...primaryPatterns, ...aliasPatterns].filter((pattern) => pattern.startsWith("/"));
}

function literalCommandPrefix(command: string): string {
  const tokens = command.trim().split(/\s+/);
  const literals: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("<") || token.startsWith("[") || token.includes("|")) {
      break;
    }
    literals.push(token);
  }
  return literals.join(" ");
}

function inputMatchesPattern(input: string, pattern: string): boolean {
  return input === pattern || input.startsWith(`${pattern} `);
}

function cmd(
  id: string,
  command: string,
  description: string,
  groupKey: string,
  action: string,
  aliases?: string[]
): SlashCommandDefinition {
  return { id, command, description, groupKey, action, aliases };
}

function cloneCommand(command: SlashCommandDefinition): SlashCommandDefinition {
  return {
    ...command,
    aliases: command.aliases ? [...command.aliases] : undefined
  };
}
