import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";
import { TaskSchema, type Task } from "./task.js";

const TaskStoreFileSchema = z.object({
  schemaVersion: z.literal(1),
  tasks: z.array(TaskSchema)
});

interface TaskStoreFile {
  schemaVersion: 1;
  tasks: Task[];
}

export class TaskStore {
  private constructor(
    private readonly filePath: string,
    private data: TaskStoreFile
  ) {}

  static async load(home: string): Promise<TaskStore> {
    const filePath = join(home, "task-store.json");
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await createDefaultJsonFile(filePath, { schemaVersion: 1, tasks: [] });
        raw = await readFile(filePath, "utf8");
      } else {
        throw error;
      }
    }
    try {
      return new TaskStore(filePath, TaskStoreFileSchema.parse(JSON.parse(raw)));
    } catch (error) {
      throw new Error(`Invalid task-store.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  list(): readonly Task[] {
    return this.data.tasks.map(cloneTask);
  }

  get(id: string): Task | undefined {
    const task = this.data.tasks.find((entry) => entry.id === id);
    return task ? cloneTask(task) : undefined;
  }

  async upsert(task: Task): Promise<void> {
    const index = this.data.tasks.findIndex((entry) => entry.id === task.id);
    const next = cloneTask({ ...task, updatedAt: new Date().toISOString() });
    if (index >= 0) {
      this.data.tasks[index] = next;
    } else {
      this.data.tasks.push(next);
    }
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    this.data.tasks = this.data.tasks.filter((entry) => entry.id !== id);
    await this.persist();
  }

  async ensureSeed(seeds: Task[]): Promise<void> {
    let changed = false;
    for (const seed of seeds) {
      if (!this.data.tasks.some((task) => task.id === seed.id)) {
        this.data.tasks.push(cloneTask(seed));
        changed = true;
      }
    }
    if (changed) {
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    await writeJsonAtomically(this.filePath, this.data);
  }
}

function cloneTask(task: Task): Task {
  return {
    ...task,
    params: { ...task.params },
    activeHours: task.activeHours ? [...task.activeHours] : null,
    target: task.target ? { ...task.target } : null,
    lastRun: task.lastRun ? { ...task.lastRun } : null
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
