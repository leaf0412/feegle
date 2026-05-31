import type { Statement } from "better-sqlite3";
import type { RuntimeDb } from "../../infra/app/runtime-db.js";

/**
 * Persists daily dedup marks in the SQLite `dedup_keys` table.
 *
 * The dedup model is date-partitioned: each `(taskId, conditionKey, dateInTz)` triple
 * is unique. Rows from previous dates are pruned lazily inside `checkAndMark` to
 * keep the table small without a separate background job.
 *
 * `checkAndMark` returns `true` (and inserts the row) when the mark is new for that
 * date, `false` when the mark already exists — mirroring the old JSON store's semantics.
 */

export class DedupStore {
  private readonly checkStmt: Statement;
  private readonly insertStmt: Statement;
  private readonly pruneStmt: Statement;
  private readonly clearAllStmt: Statement;

  constructor(db: RuntimeDb) {
    this.checkStmt = db.prepare(
      `select 1 as found from dedup_keys
         where task_id = ? and condition_key = ? and date_in_tz = ?
         limit 1`
    );

    this.insertStmt = db.prepare(
      `insert or ignore into dedup_keys(task_id, condition_key, date_in_tz)
         values (?, ?, ?)`
    );

    this.pruneStmt = db.prepare(
      `delete from dedup_keys where date_in_tz <> ?`
    );

    this.clearAllStmt = db.prepare(`delete from dedup_keys`);
  }

  async checkAndMark(taskId: string, conditionKey: string, dateInTz: string): Promise<boolean> {
    const exists = (this.checkStmt.get(taskId, conditionKey, dateInTz) as { found: number } | undefined) !== undefined;
    if (exists) {
      return false;
    }
    this.insertStmt.run(taskId, conditionKey, dateInTz);
    this.pruneStmt.run(dateInTz);
    return true;
  }

  async clearAll(): Promise<void> {
    this.clearAllStmt.run();
  }
}
