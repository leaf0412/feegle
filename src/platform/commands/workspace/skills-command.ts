import { access, constants, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface SkillsCommandDeps {
  feegleHome: string;
}

const MAX_LISTING = 50;

export class SkillsCommandHandler implements SlashCommandHandler {
  readonly id = "skills";

  constructor(private readonly deps: SkillsCommandDeps) {}

  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    const dir = join(this.deps.feegleHome, "skills");
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        return textReply(`尚未配置技能。在 ${dir}/<name>/SKILL.md 添加即可。`);
      }
      return textReply(`读取 ${dir} 失败: ${errorMessage(error)}`);
    }
    const skills: { name: string; description: string }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(dir, entry.name, "SKILL.md");
      try {
        await access(skillFile, constants.R_OK);
      } catch {
        continue;
      }
      skills.push({ name: entry.name, description: await firstHeading(skillFile) });
      if (skills.length >= MAX_LISTING) break;
    }
    if (skills.length === 0) {
      return textReply(`${dir} 下没有包含 SKILL.md 的目录。`);
    }
    const lines: string[] = [`🛠 技能目录（${skills.length}）`];
    for (const skill of skills) {
      lines.push(`  ${skill.name}${skill.description ? ` — ${skill.description}` : ""}`);
    }
    return textReply(lines.join("\n"));
  }
}

async function firstHeading(path: string): Promise<string> {
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
