import type { AliasStore } from "../alias-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface AliasCommandDeps {
  aliasStore: AliasStore;
}

export class AliasCommandHandler implements SlashCommandHandler {
  readonly id = "alias";

  constructor(private readonly deps: AliasCommandDeps) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const args = context.args.trim();
    if (args === "" || args === "list") {
      const entries = this.deps.aliasStore.list();
      if (entries.length === 0) {
        return textReply("还没有任何别名。\n用法：/alias add <key>=<完整命令> | /alias remove <key>");
      }
      const lines: string[] = [`🔗 命令别名（${entries.length}）`];
      for (const entry of entries) {
        lines.push(`  /${entry.alias} → ${entry.target}`);
      }
      return textReply(lines.join("\n"));
    }

    const removeMatch = /^remove\s+(\S+)$/.exec(args);
    if (removeMatch) {
      const alias = removeMatch[1]!;
      const removed = await this.deps.aliasStore.remove(alias);
      return textReply(removed ? `✅ 已删除别名 /${alias}` : `未找到别名 /${alias}`);
    }

    const addMatch = /^add\s+(\S+?)=(.+)$/.exec(args);
    if (addMatch) {
      const alias = addMatch[1]!;
      const target = addMatch[2]!.trim();
      try {
        await this.deps.aliasStore.set(alias, target);
      } catch (error) {
        return textReply(`设置失败: ${errorMessage(error)}`);
      }
      return textReply(`✅ 别名 /${alias} → ${target}`);
    }

    return textReply("用法：/alias list | /alias add <key>=<完整命令> | /alias remove <key>");
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
