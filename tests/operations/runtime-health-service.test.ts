import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb } from "@infra/app/runtime-db.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { RuntimeHealthService } from "@core/operations/runtime-health-service.js";
import { StuckRunDetector } from "@core/operations/stuck-run-detector.js";

describe("RuntimeHealthService", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-health-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createService(dbPath?: string) {
    const db = openRuntimeDb(dbPath ?? join(tempDir, "feegle.db"));
    const store = new RuntimeStore(db);
    const detector = new StuckRunDetector(store);
    const service = new RuntimeHealthService(store, db, detector);
    return { db, store, detector, service };
  }

  it("reports pass when DB is healthy and no stuck attempts", async () => {
    const { db, service } = createService();
    db.prepare(
      "insert into workspaces (id, name, created_at, updated_at) values ('ws_1', 'Test', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z')"
    ).run();

    const report = await service.check();
    expect(report.status).toBe("pass");
    expect(report.checks.some((c) => c.name === "db_available")).toBe(true);
    expect(report.checks.some((c) => c.name === "stuck_attempts" && c.status === "pass")).toBe(true);

    db.close();
  });

  it("does not modify running attempts during health check", async () => {
    const { db, store, service } = createService();
    const now = "2026-05-31T10:00:00.000Z";

    // Setup workspace + running workflow + running attempt
    db.prepare(
      "insert into workspaces (id, name, created_at, updated_at) values (?, ?, ?, ?)"
    ).run("ws_1", "Test", now, now);

    store.registerWorkflowDefinition({
      id: "demo.workflow",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now
    });

    store.createWorkflowInstance({
      id: "wf_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "demo.workflow",
      definitionVersion: 1,
      status: "running",
      now
    });

    store.createRunAttempt({
      id: "ra_1",
      workflowInstanceId: "wf_1",
      status: "running",
      triggerEventId: null,
      now
    });

    // Verify running before check
    const before = db
      .prepare("select status from run_attempts where id = ?")
      .get("ra_1") as { status: string };
    expect(before.status).toBe("running");

    await service.check();

    // Verify status is still "running" after health check (no mutation)
    const after = db
      .prepare("select status from run_attempts where id = ?")
      .get("ra_1") as { status: string };
    expect(after.status).toBe("running");

    db.close();
  });

  it("reports warn when stuck running attempts exist", async () => {
    const { db, store, service } = createService();
    // Create attempt far enough in the past that it is older than the default 30-min threshold
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    db.prepare(
      "insert into workspaces (id, name, created_at, updated_at) values (?, ?, ?, ?)"
    ).run("ws_1", "Test", twoHoursAgo, twoHoursAgo);

    store.registerWorkflowDefinition({
      id: "demo.workflow",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now: twoHoursAgo
    });

    store.createWorkflowInstance({
      id: "wf_stale",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "demo.workflow",
      definitionVersion: 1,
      status: "running",
      now: twoHoursAgo
    });

    // Directly insert a running attempt with the old timestamp
    db.prepare(
      `insert into run_attempts
        (id, workflow_instance_id, status, trigger_event_id, started_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?)`
    ).run("ra_stale", "wf_stale", "running", null, twoHoursAgo, twoHoursAgo, twoHoursAgo);

    const report = await service.check();
    expect(report.status).toBe("warn");
    const stuckCheck = report.checks.find((c) => c.name === "stuck_attempts");
    expect(stuckCheck).toBeDefined();
    expect(stuckCheck!.status).toBe("warn");

    db.close();
  });
});
