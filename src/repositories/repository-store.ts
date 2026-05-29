import type { Statement } from "better-sqlite3";
import { z } from "zod";
import type { RuntimeDb } from "../app/runtime-db.js";
import type { RepositoryRecord } from "../domain/models.js";

/**
 * Persists registered repositories in the SQLite `repositories` table, plus a
 * single-row `repository_id_counter` that supplies the monotonic `repo_N` ids.
 *
 * `add` runs inside a transaction: it reads + increments the counter and inserts
 * the row atomically, so concurrent adds never reuse an id. The id format
 * `repo_${n}` is preserved from the old JSON store, and `list()` orders by the
 * numeric suffix so insertion order — and thus `findByQuery("#index")` — is
 * stable even after removals.
 *
 * The zod schema stays exported so callers that imported the persisted shape
 * keep compiling; it is also used by the boot migrator to validate legacy JSON.
 */
export const RepositoryRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  remoteUrl: z.string().min(1),
  defaultBaseBranch: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type PersistedRepositoryRecord = z.infer<typeof RepositoryRecordSchema>;

export interface AddRepositoryInput {
  name: string;
  remoteUrl: string;
  defaultBaseBranch: string;
}

export interface RepositoryStoreOptions {
  clock?: () => Date;
}

interface RepositoryRow {
  id: string;
  name: string;
  remote_url: string;
  default_base_branch: string;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: RepositoryRow): RepositoryRecord {
  return {
    id: row.id,
    name: row.name,
    remoteUrl: row.remote_url,
    defaultBaseBranch: row.default_base_branch,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export class RepositoryStore {
  private readonly clock: () => Date;
  private readonly listStmt: Statement;
  private readonly getStmt: Statement;
  private readonly findByUrlStmt: Statement;
  private readonly findByNameStmt: Statement;
  private readonly readCounterStmt: Statement;
  private readonly bumpCounterStmt: Statement;
  private readonly insertStmt: Statement;
  private readonly updateStmt: Statement;
  private readonly removeStmt: Statement;
  private readonly addTx: (input: AddRepositoryInput, now: string) => RepositoryRecord;

  constructor(db: RuntimeDb, options: RepositoryStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date());

    // Order by the numeric suffix of `repo_N` so list() returns rows in stable
    // insertion order — `findByQuery("#index")` and the listed-then-remove flow
    // depend on this exactly matching the old JSON array order.
    this.listStmt = db.prepare(
      `select id, name, remote_url, default_base_branch, created_at, updated_at
         from repositories order by cast(substr(id, 6) as integer)`
    );
    this.getStmt = db.prepare(
      `select id, name, remote_url, default_base_branch, created_at, updated_at
         from repositories where id = ?`
    );
    // findByUrl returns the first match in insertion order — the old store used
    // Array.find over insertion-ordered records, and `add` never deduped URLs.
    this.findByUrlStmt = db.prepare(
      `select id, name, remote_url, default_base_branch, created_at, updated_at
         from repositories where remote_url = ?
         order by cast(substr(id, 6) as integer) limit 1`
    );
    this.findByNameStmt = db.prepare(
      `select id, name, remote_url, default_base_branch, created_at, updated_at
         from repositories where name = ?
         order by cast(substr(id, 6) as integer) limit 1`
    );
    this.readCounterStmt = db.prepare(`select next_id from repository_id_counter where id = 1`);
    this.bumpCounterStmt = db.prepare(`update repository_id_counter set next_id = ? where id = 1`);
    this.insertStmt = db.prepare(
      `insert into repositories(id, name, remote_url, default_base_branch, created_at, updated_at)
         values (@id, @name, @remote_url, @default_base_branch, @created_at, @updated_at)`
    );
    this.updateStmt = db.prepare(
      `update repositories
         set name = @name, remote_url = @remote_url, default_base_branch = @default_base_branch,
             updated_at = @updated_at
         where id = @id`
    );
    this.removeStmt = db.prepare(`delete from repositories where id = ?`);

    // Seed the counter lazily on construction; `insert or ignore` keeps an
    // already-restored counter (e.g. from a migration) intact.
    db.prepare(`insert or ignore into repository_id_counter(id, next_id) values (1, 1)`).run();

    this.addTx = db.transaction((input: AddRepositoryInput, now: string): RepositoryRecord => {
      const counter = this.readCounterStmt.get() as { next_id: number };
      const id = `repo_${counter.next_id}`;
      this.bumpCounterStmt.run(counter.next_id + 1);
      this.insertStmt.run({
        id,
        name: input.name,
        remote_url: input.remoteUrl,
        default_base_branch: input.defaultBaseBranch,
        created_at: now,
        updated_at: now
      });
      return this.get(id)!;
    });
  }

  list(): RepositoryRecord[] {
    const rows = this.listStmt.all() as RepositoryRow[];
    return rows.map(rowToRecord);
  }

  get(id: string): RepositoryRecord | undefined {
    const row = this.getStmt.get(id) as RepositoryRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  findByUrl(remoteUrl: string): RepositoryRecord | undefined {
    const row = this.findByUrlStmt.get(remoteUrl) as RepositoryRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  findByQuery(query: string): RepositoryRecord | undefined {
    const indexMatch = /^#(\d+)$/.exec(query);
    if (indexMatch) {
      const i = Number(indexMatch[1]) - 1;
      const records = this.list();
      if (i >= 0 && i < records.length) {
        return records[i]!;
      }
    }
    // Falls through to url/id/name lookup (mirrors the old store): a `#n` query
    // that is out of range won't match any url/id/name, so this is a no-op miss.
    return this.findByUrl(query) ?? this.get(query) ?? this.findByName(query);
  }

  private findByName(name: string): RepositoryRecord | undefined {
    const row = this.findByNameStmt.get(name) as RepositoryRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  async add(input: AddRepositoryInput): Promise<RepositoryRecord> {
    const now = this.clock().toISOString();
    return this.addTx(input, now);
  }

  async update(id: string, patch: Partial<Omit<RepositoryRecord, "id" | "createdAt">>): Promise<RepositoryRecord> {
    const current = this.get(id);
    if (!current) {
      throw new Error(`repository not found: ${id}`);
    }
    this.updateStmt.run({
      id,
      name: patch.name ?? current.name,
      remote_url: patch.remoteUrl ?? current.remoteUrl,
      default_base_branch: patch.defaultBaseBranch ?? current.defaultBaseBranch,
      updated_at: this.clock().toISOString()
    });
    return this.get(id)!;
  }

  async remove(id: string): Promise<boolean> {
    const result = this.removeStmt.run(id);
    return result.changes > 0;
  }
}
