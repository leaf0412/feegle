import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

const PACKAGE_JSON_FROM_DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "package.json");
const PACKAGE_JSON_FROM_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "package.json");

export class VersionCommandHandler implements SlashCommandHandler {
  readonly id = "version";

  async execute(): Promise<SlashCommandReply> {
    const version = await readVersion();
    const sha = process.env.FEEGLE_GIT_SHA?.slice(0, 7);
    const text = sha ? `feegle ${version} (${sha})` : `feegle ${version}`;
    return { kind: "text", text };
  }
}

async function readVersion(): Promise<string> {
  for (const candidate of [PACKAGE_JSON_FROM_SRC, PACKAGE_JSON_FROM_DIST]) {
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as { version?: unknown };
      if (typeof parsed.version === "string") {
        return parsed.version;
      }
    } catch {
      // try next candidate
    }
  }
  return "unknown";
}
