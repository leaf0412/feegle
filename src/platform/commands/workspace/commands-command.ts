import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface CommandsCommandDeps {
  feegleHome: string;
}

const MAX_LISTING = 50;

export class CommandsCommandHandler implements SlashCommandHandler {
  readonly id = "commands";

  constructor(private readonly deps: CommandsCommandDeps) {}

  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    const dir = join(this.deps.feegleHome, "commands");
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        return textReply(`尚未配置自定义命令。把 .md 文件放在 ${dir} 即可。`);
      }
      return textReply(`读取 ${dir} 失败: ${errorMessage(error)}`);
    }
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .slice(0, MAX_LISTING);
    if (files.length === 0) {
      return textReply(`${dir} 下没有 .md 自定义命令。`);
    }
    const lines: string[] = [`📋 自定义命令（${files.length}）`];
    for (const file of files) {
      const description = await firstLine(join(dir, file.name));
      const name = file.name.replace(/\.md$/, "");
      lines.push(`  /${name}${description ? ` — ${description}` : ""}`);
    }
    return textReply(lines.join("\n"));
  }
}

async function firstLine(path: string): Promise<string> {
  try {
    const raw = await readFile(path, "utf8");
    const firstNonEmpty = raw
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .find((line) => line.length > 0);
    return firstNonEmpty ?? "";
  } catch {
    return "";
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
