export type SlashCommandSource = "cc-connect" | "feegle";

export interface SlashCommandGroup {
  key: string;
  title: string;
}

export interface SlashCommandDefinition {
  id: string;
  command: string;
  description: string;
  groupKey: string;
  source: SlashCommandSource;
  action: string;
  aliases?: string[];
  detail?: string;
}

export const defaultSlashCommandGroupKey = "session";

export const slashCommandGroups: SlashCommandGroup[] = [
  { key: "session", title: "会话" },
  { key: "agent", title: "Agent" },
  { key: "repo", title: "仓库" },
  { key: "roles", title: "宗门" },
  { key: "setup", title: "配置" },
  { key: "knowledge", title: "知识" },
  { key: "system", title: "系统" }
];

export const slashCommands: SlashCommandDefinition[] = [
  cc("new", "/new", "创建新会话", "session", "act:/new"),
  cc("list", "/list", "查看会话列表", "session", "nav:/list"),
  cc("current", "/current", "查看当前会话", "session", "nav:/current"),
  cc("switch", "/switch", "切换会话", "session", "nav:/list"),
  cc("search", "/search", "搜索历史会话", "session", "cmd:/search"),
  cc("history", "/history", "查看会话历史", "session", "nav:/history"),
  cc("delete", "/delete", "删除会话", "session", "cmd:/delete"),
  cc("name", "/name", "重命名会话", "session", "cmd:/name"),
  feegle("sessions", "/sessions", "查看活跃交互会话", "session", "nav:/command sessions"),
  feegle("exit", "/exit", "退出交互会话", "session", "nav:/command exit"),
  feegle("clear", "/clear", "清空对话历史", "session", "nav:/command clear"),
  feegle("stop", "/stop", "中止当前会话", "session", "act:/stop"),

  cc("model", "/model", "切换模型", "agent", "nav:/model"),
  cc("reasoning", "/reasoning", "切换推理强度", "agent", "nav:/reasoning"),
  cc("mode", "/mode", "切换运行模式", "agent", "nav:/mode"),
  cc("provider", "/provider", "管理模型提供方", "agent", "nav:/provider"),
  cc("memory", "/memory", "管理记忆", "agent", "cmd:/memory"),
  cc("allow", "/allow", "授权工具权限", "agent", "cmd:/allow"),
  cc("quiet", "/quiet", "切换安静模式", "agent", "cmd:/quiet"),
  cc("tts", "/tts", "切换语音播报", "agent", "cmd:/tts"),
  feegle("claude", "/claude <消息>", "跳过 light pilot，强制使用 Claude Code", "agent", "nav:/command claude"),
  feegle("codex", "/codex <消息>", "跳过 light pilot，强制使用 Codex", "agent", "nav:/command codex"),

  feegle("bind", "/bind|/bid <branch> <base> [repo1 ...]", "仓库规则绑定", "repo", "nav:/command bind", ["bid"]),
  feegle("repo_show", "/repo show", "显示当前绑定", "repo", "nav:/command repo_show"),
  feegle("repo_clear", "/repo clear", "清除绑定", "repo", "nav:/command repo_clear"),
  feegle("repo_list", "/repo list", "列出已注册仓库", "repo", "nav:/command repo_list"),
  feegle("repo_add", "/repo add <url>", "注册外部仓库", "repo", "nav:/command repo_add"),
  feegle("repo_remove", "/repo remove <#索引|url|alias|repo-key>", "删除外部仓库", "repo", "nav:/command repo_remove"),
  feegle("repo_scan", "/repo scan", "刷新已注册仓库元数据", "repo", "nav:/command repo_scan", ["/repo sync"]),
  feegle("shifu", "/shifu bind|show|unbind|sync", "shifu 同步管理", "repo", "nav:/command shifu"),
  cc("workspace", "/workspace", "工作区绑定与初始化", "repo", "cmd:/workspace"),
  cc("dir", "/dir", "选择工作目录", "repo", "nav:/dir"),

  feegle("role_add", "/role add admin|developer|pm <用户名>", "收徒入门，写入宗门名册", "roles", "nav:/command role_add"),
  feegle("role_remove", "/role remove admin|developer|pm <用户名>", "逐出宗门，收回门内身份", "roles", "nav:/command role_remove"),
  feegle("role_list", "/role list", "查看当前宗门名册", "roles", "nav:/command role_list"),
  feegle("fork", "/fork <群名> [@用户...]", "创建群聊并拉人", "roles", "nav:/command fork"),

  feegle("setup", "/setup", "开始项目配置", "setup", "nav:/command setup"),
  feegle("confirm", "/confirm", "确认配置", "setup", "nav:/command confirm"),
  feegle("cancel", "/cancel", "取消配置", "setup", "nav:/command cancel"),
  feegle("ctx", "/ctx set|show|clear|list", "管理群聊上下文", "setup", "nav:/command ctx"),
  cc("config", "/config", "查看运行配置", "setup", "nav:/config"),
  cc("commands", "/commands", "管理自定义命令", "setup", "nav:/commands"),
  cc("alias", "/alias", "管理命令别名", "setup", "nav:/alias"),
  cc("skills", "/skills", "查看技能目录", "setup", "nav:/skills"),

  feegle("note_add", "/note_add <内容>", "新增笔记（仅 admin）", "knowledge", "nav:/command note_add"),
  feegle("note_find", "/note_find [10-20] <关键词>", "检索笔记（仅 admin）", "knowledge", "nav:/command note_find"),
  feegle("note_recent", "/note_recent [10-20]", "最近笔记，默认 20 条（仅 admin）", "knowledge", "nav:/command note_recent"),
  cc("shell", "/shell", "执行 shell 工具", "knowledge", "cmd:/shell"),
  cc("show", "/show", "展示文件或结果", "knowledge", "cmd:/show"),
  cc("cron", "/cron", "管理定时任务", "knowledge", "nav:/cron"),
  cc("heartbeat", "/heartbeat", "管理 heartbeat", "knowledge", "nav:/heartbeat"),
  cc("compress", "/compress", "压缩上下文", "knowledge", "cmd:/compress"),

  feegle("ping", "/ping", "检查状态", "system", "nav:/command ping"),
  feegle("info", "/info", "查看实例状态（网络、JVM、Worker、心跳）", "system", "nav:/command info"),
  cc("status", "/status", "查看状态", "system", "nav:/status"),
  cc("doctor", "/doctor", "运行诊断", "system", "nav:/doctor"),
  cc("usage", "/usage", "查看用量", "system", "cmd:/usage"),
  cc("version", "/version", "查看版本", "system", "nav:/version"),
  cc("upgrade", "/upgrade", "检查升级", "system", "nav:/upgrade"),
  cc("restart", "/restart", "重启服务", "system", "cmd:/restart"),
  cc("lang", "/lang", "切换语言", "system", "nav:/lang"),
  feegle("help", "/help", "显示帮助", "system", "nav:/help")
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

function cc(id: string, command: string, description: string, groupKey: string, action: string): SlashCommandDefinition {
  return {
    id,
    command,
    description,
    groupKey,
    action,
    source: "cc-connect"
  };
}

function feegle(
  id: string,
  command: string,
  description: string,
  groupKey: string,
  action: string,
  aliases?: string[]
): SlashCommandDefinition {
  return {
    id,
    command,
    description,
    groupKey,
    action,
    aliases,
    source: "feegle"
  };
}

function cloneCommand(command: SlashCommandDefinition): SlashCommandDefinition {
  return {
    ...command,
    aliases: command.aliases ? [...command.aliases] : undefined
  };
}
