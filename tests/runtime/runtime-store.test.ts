import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";

describe("runtime schema", () => {
  let tempDir: string;
  let db: RuntimeDb;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-runtime-store-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates durable runtime tables before workflow execution exists", () => {
    const tables = db
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all() as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "workflow_definitions",
        "workflow_instances",
        "run_attempts",
        "step_states",
        "effect_executions",
        "runtime_events"
      ])
    );
  });
});
