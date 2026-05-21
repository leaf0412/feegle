import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";

describe("openRuntimeDb", () => {
  let home: string;
  let db: RuntimeDb | undefined;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-runtime-db-"));
  });

  afterEach(async () => {
    db?.close();
    await rm(home, { recursive: true, force: true });
  });

  it("creates runtime tables on open", () => {
    db = openRuntimeDb(join(home, "feegle.db"));

    expect(tableExists(db, "chat_bindings")).toBe(true);
    expect(tableExists(db, "pending_interactions")).toBe(true);
    expect(tableExists(db, "plan_artifacts")).toBe(true);
  });
});

function tableExists(db: RuntimeDb, tableName: string): boolean {
  return Boolean(
    db
      .prepare("select name from sqlite_master where type = 'table' and name = ?")
      .get(tableName)
  );
}
