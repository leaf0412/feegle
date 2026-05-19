import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";

export const WorkspaceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  path: z.string().min(1),
  gitRemote: z.string().min(1).optional(),
  defaultBranch: z.string().min(1).optional(),
  createdAt: z.string()
});

export type WorkspaceRecord = z.infer<typeof WorkspaceRecordSchema>;

export const WorkspacesFileSchema = z.object({
  schemaVersion: z.literal(1),
  nextId: z.number().int().nonnegative(),
  workspaces: z.array(WorkspaceRecordSchema)
});

export type WorkspacesFile = z.infer<typeof WorkspacesFileSchema>;

const DEFAULT: WorkspacesFile = { schemaVersion: 1, nextId: 1, workspaces: [] };

export interface AddWorkspaceInput {
  path: string;
  name?: string;
  gitRemote?: string;
  defaultBranch?: string;
}

export class WorkspaceStore {
  private constructor(
    private readonly filePath: string,
    private data: WorkspacesFile,
    private readonly clock: () => Date
  ) {}

  static async load(home: string, clock: () => Date = () => new Date()): Promise<WorkspaceStore> {
    const filePath = join(home, "workspaces.json");
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
      return new WorkspaceStore(filePath, WorkspacesFileSchema.parse(JSON.parse(raw)), clock);
    } catch (error) {
      throw new Error(`Invalid workspaces.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  list(): WorkspaceRecord[] {
    return this.data.workspaces.map((w) => ({ ...w }));
  }

  get(id: string): WorkspaceRecord | undefined {
    const w = this.data.workspaces.find((entry) => entry.id === id);
    return w ? { ...w } : undefined;
  }

  findByQuery(query: string): WorkspaceRecord | undefined {
    const indexMatch = /^#(\d+)$/.exec(query);
    if (indexMatch) {
      const i = Number(indexMatch[1]) - 1;
      if (i >= 0 && i < this.data.workspaces.length) {
        return { ...this.data.workspaces[i]! };
      }
    }
    return (
      this.get(query) ??
      (() => {
        const w = this.data.workspaces.find((entry) => entry.name === query || entry.path === query);
        return w ? { ...w } : undefined;
      })()
    );
  }

  async add(input: AddWorkspaceInput): Promise<WorkspaceRecord> {
    const created: WorkspaceRecord = {
      id: `ws_${this.data.nextId}`,
      path: input.path,
      ...(input.name ? { name: input.name } : {}),
      ...(input.gitRemote ? { gitRemote: input.gitRemote } : {}),
      ...(input.defaultBranch ? { defaultBranch: input.defaultBranch } : {}),
      createdAt: this.clock().toISOString()
    };
    const next: WorkspacesFile = {
      schemaVersion: 1,
      nextId: this.data.nextId + 1,
      workspaces: [...this.data.workspaces, created]
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return { ...created };
  }

  async remove(id: string): Promise<boolean> {
    const remaining = this.data.workspaces.filter((entry) => entry.id !== id);
    if (remaining.length === this.data.workspaces.length) return false;
    const next: WorkspacesFile = {
      schemaVersion: 1,
      nextId: this.data.nextId,
      workspaces: remaining
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return true;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
