import type { RepositoryRecord } from "../domain/models.js";

export interface AddRepositoryInput {
  name: string;
  remoteUrl: string;
  defaultBaseBranch: string;
}

export class InMemoryRepositoryRegistry {
  private readonly records: RepositoryRecord[] = [];
  private nextId = 1;

  add(input: AddRepositoryInput): RepositoryRecord {
    const now = new Date();
    const record: RepositoryRecord = {
      id: `repo_${this.nextId++}`,
      name: input.name,
      remoteUrl: input.remoteUrl,
      defaultBaseBranch: input.defaultBaseBranch,
      createdAt: now,
      updatedAt: now
    };

    this.records.push(record);

    return copyRepositoryRecord(record);
  }

  list(): RepositoryRecord[] {
    return this.records.map(copyRepositoryRecord);
  }

  getMany(ids: string[]): RepositoryRecord[] {
    return ids.map((id) => {
      const record = this.records.find((repo) => repo.id === id);
      if (!record) {
        throw new Error(`Repository not found: ${id}`);
      }

      return copyRepositoryRecord(record);
    });
  }
}

function copyRepositoryRecord(record: RepositoryRecord): RepositoryRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt)
  };
}
