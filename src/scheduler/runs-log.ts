import { mkdir, readFile, stat, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const RunsLogEntrySchema = z.object({
  taskId: z.string().min(1),
  kind: z.string().min(1),
  at: z.string(),
  outcome: z.enum(["ok", "silent", "noop", "skipped", "failed"]),
  durationMs: z.number().nonnegative(),
  note: z.string().optional()
});

export type RunsLogEntry = z.infer<typeof RunsLogEntrySchema>;

export class RunsLog {
  private constructor(private readonly filePath: string) {}

  static async open(home: string): Promise<RunsLog> {
    await mkdir(home, { recursive: true });
    const filePath = join(home, "runs.log.jsonl");
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > 50 * 1024 * 1024) {
        console.warn("runs.log.jsonl is larger than 50MB", { filePath });
      }
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    return new RunsLog(filePath);
  }

  async append(entry: RunsLogEntry): Promise<void> {
    await appendFile(this.filePath, `${JSON.stringify(RunsLogEntrySchema.parse(entry))}\n`, { flag: "a" });
  }

  async *tailReverse(filter: { taskId?: string; limit?: number } = {}): AsyncIterable<RunsLogEntry> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
    const lines = raw.split("\n").filter((line) => line.trim().length > 0).reverse();
    let yielded = 0;
    for (const line of lines) {
      const entry = RunsLogEntrySchema.parse(JSON.parse(line));
      if (filter.taskId && entry.taskId !== filter.taskId) {
        continue;
      }
      yield entry;
      yielded += 1;
      if (filter.limit && yielded >= filter.limit) {
        return;
      }
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
