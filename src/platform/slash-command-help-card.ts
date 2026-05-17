import { createPlatformCard, type PlatformCard } from "./platform-card.js";
import {
  defaultSlashCommandGroupKey,
  findSlashCommandById,
  listSlashCommandGroups,
  listSlashCommands,
  type SlashCommandDefinition
} from "./slash-command-catalog.js";

export function buildSlashCommandHelpCard(groupKey = defaultSlashCommandGroupKey): PlatformCard {
  const groups = listSlashCommandGroups();
  const selectedGroup = groups.find((group) => group.key === groupKey) ?? groups[0];
  const commands = listSlashCommands(selectedGroup.key);
  const card = createPlatformCard().title(`命令面板 · ${selectedGroup.title}`, "blue");

  for (let index = 0; index < groups.length; index += 2) {
    card.buttonRow(
      groups.slice(index, index + 2).map((group) => ({
        text: group.title,
        type: group.key === selectedGroup.key ? "primary" : "default",
        action: `nav:/help ${group.key}`
      })),
      "equal_columns"
    );
  }

  commands.forEach((command) => {
    card.listItem(renderCommandLine(command), {
      text: "进入",
      type: command.source === "feegle" ? "primary" : "default",
      action: `nav:/command ${command.id}`
    });
  });

  card.note("点击分类切换面板，点击进入查看用法。");
  return card.build();
}

export function buildSlashCommandDetailCard(commandId: string): PlatformCard {
  const command = findSlashCommandById(commandId);
  if (!command) {
    return createPlatformCard()
      .title("命令不存在", "red")
      .markdown(`没有找到命令：${commandId}`)
      .buttonRow([{ text: "返回帮助", type: "default", action: "nav:/help" }])
      .build();
  }

  const sourceText = command.source === "cc-connect" ? "CC Connect 原生" : "Feegle 计划新增";
  const detail = command.detail ?? command.description;
  return createPlatformCard()
    .title(command.command, command.source === "feegle" ? "wathet" : "blue")
    .markdown([`**来源**：${sourceText}`, `**说明**：${detail}`, renderAliasLine(command)].filter(Boolean).join("\n"))
    .buttonRow(
      [
        { text: "返回分组", type: "default", action: `nav:/help ${command.groupKey}` },
        { text: "返回总览", type: "default", action: "nav:/help" }
      ],
      "equal_columns"
    )
    .build();
}

function renderCommandLine(command: SlashCommandDefinition): string {
  const source = command.source === "cc-connect" ? "CC" : "Feegle";
  return `**${command.command}**\n${command.description} · ${source}`;
}

function renderAliasLine(command: SlashCommandDefinition): string | undefined {
  if (!command.aliases || command.aliases.length === 0) {
    return undefined;
  }
  return `**别名**：${command.aliases.join("、")}`;
}
