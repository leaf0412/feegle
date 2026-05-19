import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";

const DedupFileSchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string(),
  marks: z.record(z.array(z.string()))
});

type DedupFile = z.infer<typeof DedupFileSchema>;

export class DedupStore {
  private constructor(
    private readonly filePath: string,
    private data: DedupFile
  ) {}

  static async load(home: string): Promise<DedupStore> {
    const filePath = join(home, "dedup.json");
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await createDefaultJsonFile(filePath, { schemaVersion: 1, date: "", marks: {} });
        raw = await readFile(filePath, "utf8");
      } else {
        throw error;
      }
    }
    try {
      return new DedupStore(filePath, DedupFileSchema.parse(JSON.parse(raw)));
    } catch (error) {
      throw new Error(`Invalid dedup.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  async checkAndMark(taskId: string, conditionKey: string, dateInTz: string): Promise<boolean> {
    if (this.data.date !== dateInTz) {
      this.data = { schemaVersion: 1, date: dateInTz, marks: {} };
    }
    const marks = this.data.marks[taskId] ?? [];
    if (marks.includes(conditionKey)) {
      return false;
    }
    this.data.marks[taskId] = [...marks, conditionKey];
    await this.persist();
    return true;
  }

  async clearAll(): Promise<void> {
    this.data = { schemaVersion: 1, date: "", marks: {} };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await writeJsonAtomically(this.filePath, this.data);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
