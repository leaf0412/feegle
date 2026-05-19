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

export function listSlashCommandGroups(): SlashCommandGroup[] {
  return slashCommandGroups.map((group) => ({ ...group }));
}

export function defineSlashCommand(
  id: string,
  command: string,
  description: string,
  groupKey: string,
  action: string,
  aliases?: string[]
): SlashCommandDefinition {
  return { id, command, description, groupKey, action, aliases };
}
