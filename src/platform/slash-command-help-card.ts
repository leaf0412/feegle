import { createPlatformCard, type PlatformCard, type PlatformCardButton } from "./platform-card.js";
import {
  defaultSlashCommandGroupKey,
  findSlashCommandById,
  listSlashCommandGroups,
  listSlashCommands,
  type SlashCommandDefinition,
  type SlashCommandGroup
} from "./slash-command-catalog.js";
import type { SlashCommandRegistryReadView } from "./slash-command-handler.js";

const ALL_COMMANDS_KEY = "all";
const ALL_COMMANDS_TITLE = "全部";
const GROUP_BUTTONS_PER_ROW = 3;

export function buildSlashCommandHelpCard(
  registry: SlashCommandRegistryReadView,
  groupKey = defaultSlashCommandGroupKey
): PlatformCard {
  const groups = [...listSlashCommandGroups(), { key: ALL_COMMANDS_KEY, title: ALL_COMMANDS_TITLE }];
  const selectedGroup = groups.find((group) => group.key === groupKey) ?? groups[0];
  const commands = selectedGroup.key === ALL_COMMANDS_KEY
    ? listSlashCommands()
    : listSlashCommands(selectedGroup.key);
  const card = createPlatformCard().title(`命令面板 · ${selectedGroup.title}`, "blue");

  for (let index = 0; index < groups.length; index += GROUP_BUTTONS_PER_ROW) {
    card.buttonRow(
      groups.slice(index, index + GROUP_BUTTONS_PER_ROW).map((group) => buildGroupButton(group, selectedGroup.key)),
      "equal_columns"
    );
  }

  card.markdown(renderCommandTable(commands, registry, selectedGroup.key === ALL_COMMANDS_KEY));
  if (commands.length > 0) {
    card.select(
      "查看命令详情",
      commands.map((command) => ({
        text: `${command.command}${registry.isImplemented(command.id) ? "" : " · 规划中"}`,
        action: `nav:/command ${command.id}`
      }))
    );
  }

  card.note("点击分类切换；✅ 已实现，⚙️ 规划中；下拉查看命令用法。");
  return card.build();
}

export function buildSlashCommandDetailCard(
  commandId: string,
  registry: SlashCommandRegistryReadView
): PlatformCard {
  const command = findSlashCommandById(commandId);
  if (!command) {
    return createPlatformCard()
      .title("命令不存在", "red")
      .markdown(`没有找到命令：${commandId}`)
      .buttonRow([{ text: "返回帮助", type: "default", action: "nav:/help" }])
      .build();
  }

  const implemented = registry.isImplemented(command.id);
  const statusText = implemented ? "✅ 已实现" : "⚙️ 规划中（暂未接入执行器）";
  const detail = command.detail ?? command.description;
  return createPlatformCard()
    .title(command.command, implemented ? "blue" : "grey")
    .markdown(
      [
        `**状态**：${statusText}`,
        `**说明**：${detail}`,
        renderAliasLine(command)
      ].filter(Boolean).join("\n")
    )
    .buttonRow(
      [
        { text: "返回分组", type: "default", action: `nav:/help ${command.groupKey}` },
        { text: "返回总览", type: "default", action: "nav:/help" }
      ],
      "equal_columns"
    )
    .build();
}

function buildGroupButton(group: SlashCommandGroup, selectedKey: string): PlatformCardButton {
  return {
    text: group.title,
    type: group.key === selectedKey ? "primary" : "default",
    action: `nav:/help ${group.key}`
  };
}

function renderCommandTable(
  commands: ReadonlyArray<SlashCommandDefinition>,
  registry: SlashCommandRegistryReadView,
  showGroup: boolean
): string {
  if (commands.length === 0) {
    return "_当前分组暂无命令。_";
  }
  const headers = showGroup ? ["状态", "命令", "说明", "分组"] : ["状态", "命令", "说明"];
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const command of commands) {
    const status = registry.isImplemented(command.id) ? "✅" : "⚙️";
    const description = registry.isImplemented(command.id)
      ? command.description
      : `_${command.description}_`;
    const cells = showGroup
      ? [status, escapeTableCell(command.command), escapeTableCell(description), escapeTableCell(groupTitle(command.groupKey))]
      : [status, escapeTableCell(command.command), escapeTableCell(description)];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function escapeTableCell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function groupTitle(groupKey: string): string {
  const group = listSlashCommandGroups().find((entry) => entry.key === groupKey);
  return group?.title ?? groupKey;
}

function renderAliasLine(command: SlashCommandDefinition): string | undefined {
  if (!command.aliases || command.aliases.length === 0) {
    return undefined;
  }
  return `**别名**：${command.aliases.join("、")}`;
}
