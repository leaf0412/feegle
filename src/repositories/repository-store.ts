import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";
import type { RepositoryRecord } from "../domain/models.js";

export const RepositoryRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  remoteUrl: z.string().min(1),
  defaultBaseBranch: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type PersistedRepositoryRecord = z.infer<typeof RepositoryRecordSchema>;

export const RepositoriesFileSchema = z.object({
  schemaVersion: z.literal(1),
  nextId: z.number().int().nonnegative(),
  repositories: z.array(RepositoryRecordSchema)
});

export type RepositoriesFile = z.infer<typeof RepositoriesFileSchema>;

const DEFAULT: RepositoriesFile = { schemaVersion: 1, nextId: 1, repositories: [] };

export interface AddRepositoryInput {
  name: string;
  remoteUrl: string;
  defaultBaseBranch: string;
}

export class RepositoryStore {
  private constructor(
    private readonly filePath: string,
    private data: RepositoriesFile,
    private readonly clock: () => Date
  ) {}

  static async load(home: string, clock: () => Date = () => new Date()): Promise<RepositoryStore> {
    const filePath = join(home, "repositories.json");
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
      return new RepositoryStore(filePath, RepositoriesFileSchema.parse(JSON.parse(raw)), clock);
    } catch (error) {
      throw new Error(`Invalid repositories.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  list(): RepositoryRecord[] {
    return this.data.repositories.map(toRecord);
  }

  get(id: string): RepositoryRecord | undefined {
    const record = this.data.repositories.find((entry) => entry.id === id);
    return record ? toRecord(record) : undefined;
  }

  findByUrl(remoteUrl: string): RepositoryRecord | undefined {
    const record = this.data.repositories.find((entry) => entry.remoteUrl === remoteUrl);
    return record ? toRecord(record) : undefined;
  }

  findByQuery(query: string): RepositoryRecord | undefined {
    const indexMatch = /^#(\d+)$/.exec(query);
    if (indexMatch) {
      const i = Number(indexMatch[1]) - 1;
      if (i >= 0 && i < this.data.repositories.length) {
        return toRecord(this.data.repositories[i]!);
      }
    }
    return (
      this.findByUrl(query) ??
      this.get(query) ??
      (() => {
        const record = this.data.repositories.find((entry) => entry.name === query);
        return record ? toRecord(record) : undefined;
      })()
    );
  }

  async add(input: AddRepositoryInput): Promise<RepositoryRecord> {
    const now = this.clock().toISOString();
    const record: PersistedRepositoryRecord = {
      id: `repo_${this.data.nextId}`,
      name: input.name,
      remoteUrl: input.remoteUrl,
      defaultBaseBranch: input.defaultBaseBranch,
      createdAt: now,
      updatedAt: now
    };
    const next: RepositoriesFile = {
      schemaVersion: 1,
      nextId: this.data.nextId + 1,
      repositories: [...this.data.repositories, record]
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return toRecord(record);
  }

  async update(id: string, patch: Partial<Omit<RepositoryRecord, "id" | "createdAt">>): Promise<RepositoryRecord> {
    const index = this.data.repositories.findIndex((entry) => entry.id === id);
    if (index === -1) {
      throw new Error(`repository not found: ${id}`);
    }
    const current = this.data.repositories[index]!;
    const updated: PersistedRepositoryRecord = {
      ...current,
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.remoteUrl ? { remoteUrl: patch.remoteUrl } : {}),
      ...(patch.defaultBaseBranch ? { defaultBaseBranch: patch.defaultBaseBranch } : {}),
      updatedAt: this.clock().toISOString()
    };
    const next: RepositoriesFile = {
      schemaVersion: 1,
      nextId: this.data.nextId,
      repositories: this.data.repositories.map((entry, i) => (i === index ? updated : entry))
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return toRecord(updated);
  }

  async remove(id: string): Promise<boolean> {
    const remaining = this.data.repositories.filter((entry) => entry.id !== id);
    if (remaining.length === this.data.repositories.length) return false;
    const next: RepositoriesFile = {
      schemaVersion: 1,
      nextId: this.data.nextId,
      repositories: remaining
    };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
    return true;
  }
}

function toRecord(persisted: PersistedRepositoryRecord): RepositoryRecord {
  return {
    id: persisted.id,
    name: persisted.name,
    remoteUrl: persisted.remoteUrl,
    defaultBaseBranch: persisted.defaultBaseBranch,
    createdAt: new Date(persisted.createdAt),
    updatedAt: new Date(persisted.updatedAt)
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
