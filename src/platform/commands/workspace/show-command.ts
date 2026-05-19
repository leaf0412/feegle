import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { isOwner } from "../../owner-access.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface ShowCommandDeps {
  ownerEmails?: ReadonlySet<string>;
}

const MAX_BYTES = 64 * 1024;
const MAX_LINES = 200;

export class ShowCommandHandler implements SlashCommandHandler {
  readonly id = "show";
  readonly ownerOnly = true;

  constructor(private readonly deps: ShowCommandDeps = {}) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails ?? new Set());
  }

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const target = context.args.trim();
    if (!target) {
      return textReply("用法：/show <绝对路径>");
    }
    if (!isAbsolute(target)) {
      return textReply("仅支持绝对路径。");
    }
    let info;
    try {
      info = await stat(target);
    } catch (error) {
      return textReply(`无法访问 ${target}: ${errorMessage(error)}`);
    }
    if (!info.isFile()) {
      return textReply(`${target} 不是普通文件。`);
    }
    if (info.size > MAX_BYTES) {
      return textReply(`文件超过 ${MAX_BYTES} bytes（实际 ${info.size}），拒绝输出。`);
    }
    let raw: string;
    try {
      raw = await readFile(target, "utf8");
    } catch (error) {
      return textReply(`读取失败: ${errorMessage(error)}`);
    }
    const lines = raw.split("\n");
    const truncated = lines.length > MAX_LINES;
    const head = lines.slice(0, MAX_LINES).join("\n");
    const footer = truncated ? `\n…（已截断，原文共 ${lines.length} 行）` : "";
    return textReply(`📄 ${target}\n\n${head}${footer}`);
  }
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
