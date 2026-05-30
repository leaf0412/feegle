import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { RuntimeStore } from "../../src/runtime/runtime-store.js";

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

  it("creates attempts before execution and appends runtime events", () => {
    db.prepare(
      `insert into workspaces (id, name, created_at, updated_at)
       values ('ws_1', 'Personal', '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z')`
    ).run();
    const store = new RuntimeStore(db);

    store.registerWorkflowDefinition({
      id: "test.echo",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now: "2026-05-30T00:00:01.000Z"
    });
    store.createWorkflowInstance({
      id: "wfi_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "test.echo",
      definitionVersion: 1,
      status: "running",
      now: "2026-05-30T00:00:02.000Z"
    });
    store.createRunAttempt({
      id: "run_1",
      workflowInstanceId: "wfi_1",
      status: "running",
      triggerEventId: null,
      now: "2026-05-30T00:00:03.000Z"
    });

    expect(store.getActiveMutatingAttempt("wfi_1")?.id).toBe("run_1");
  });
});
