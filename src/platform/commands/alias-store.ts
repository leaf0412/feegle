import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../../app/json-file.js";

const ALIAS_KEY_RE = /^[A-Za-z0-9_\-]+$/;

export const AliasEntrySchema = z.object({
  alias: z.string().regex(ALIAS_KEY_RE),
  target: z.string().min(1)
});

export type AliasEntry = z.infer<typeof AliasEntrySchema>;

export const AliasesFileSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(AliasEntrySchema)
});

export type AliasesFile = z.infer<typeof AliasesFileSchema>;

const DEFAULT: AliasesFile = { schemaVersion: 1, entries: [] };

export class AliasStore {
  private constructor(
    private readonly filePath: string,
    private data: AliasesFile
  ) {}

  static async load(home: string): Promise<AliasStore> {
    const filePath = join(home, "aliases.json");
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await createDefaultJsonFile(filePath, DEFAULT);
        raw = await readFile(filePath, "utf8");
      } else {
        throw error;
      }
    }
    try {
      return new AliasStore(filePath, AliasesFileSchema.parse(JSON.parse(raw)));
    } catch (error) {
      throw new Error(`Invalid aliases.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  list(): AliasEntry[] {
    return this.data.entries.map((entry) => ({ ...entry }));
  }

  resolve(alias: string): string | undefined {
    return this.data.entries.find((entry) => entry.alias === alias)?.target;
  }

  async set(alias: string, target: string): Promise<void> {
    const validated = AliasEntrySchema.parse({ alias, target });
    const next: AliasesFile = {
      schemaVersion: 1,
      entries: [
        ...this.data.entries.filter((entry) => entry.alias !== validated.alias),
        validated
      ]
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
  }

  async remove(alias: string): Promise<boolean> {
    const next = this.data.entries.filter((entry) => entry.alias !== alias);
    if (next.length === this.data.entries.length) return false;
    const file: AliasesFile = { schemaVersion: 1, entries: next };
    await writeJsonAtomically(this.filePath, file);
    this.data = file;
    return true;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
