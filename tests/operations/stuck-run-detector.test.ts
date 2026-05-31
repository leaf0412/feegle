import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb } from "../../src/app/runtime-db.js";
import { RuntimeStore } from "../../src/core/runtime/runtime-store.js";
import { StuckRunDetector } from "../../src/operations/stuck-run-detector.js";

describe("StuckRunDetector", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-stuck-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seedDb() {
    const db = openRuntimeDb(join(tempDir, "feegle.db"));
    const store = new RuntimeStore(db);
    const now = "2026-05-31T10:00:00.000Z";

    // Workspace
    db.prepare(
      "insert into workspaces (id, name, created_at, updated_at) values (?, ?, ?, ?)"
    ).run("ws_1", "Test Workspace", now, now);

    // Workflow definition
    store.registerWorkflowDefinition({
      id: "demo.workflow",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      now
    });

    // Workflow instances
    store.createWorkflowInstance({
      id: "wf_stale",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "demo.workflow",
      definitionVersion: 1,
      status: "running",
      now
    });

    store.createWorkflowInstance({
      id: "wf_fresh",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "demo.workflow",
      definitionVersion: 1,
      status: "running",
      now
    });

    store.createWorkflowInstance({
      id: "wf_waiting",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "demo.workflow",
      definitionVersion: 1,
      status: "waiting",
      now
    });

    // Stale running attempt (created at 10:00)
    store.createRunAttempt({
      id: "ra_stale",
      workflowInstanceId: "wf_stale",
      status: "running",
      triggerEventId: null,
      now
    });

    // Fresh running attempt (created at 10:45 — 45 min later than the stale one)
    const freshTime = "2026-05-31T10:45:00.000Z";
    store.createRunAttempt({
      id: "ra_fresh",
      workflowInstanceId: "wf_fresh",
      status: "running",
      triggerEventId: null,
      now: freshTime
    });

    // Waiting attempt
    store.createRunAttempt({
      id: "ra_waiting",
      workflowInstanceId: "wf_waiting",
      status: "waiting",
      triggerEventId: null,
      now
    });

    return { db, store };
  }

  it("reports stale running attempt with concrete IDs", () => {
    const { db, store } = seedDb();
    const detector = new StuckRunDetector(store, 30 * 60 * 1000); // 30 min max
    const nowIso = "2026-05-31T11:00:00.000Z"; // 1 hour after stale creation

    const stuck = detector.detect(nowIso);

    expect(stuck).toHaveLength(1);
    expect(stuck[0]).toMatchObject({
      attemptId: "ra_stale",
      workflowInstanceId: "wf_stale",
      status: "running"
    });

    db.close();
  });

  it("does not report fresh running attempt as stuck", () => {
    const { db, store } = seedDb();
    const detector = new StuckRunDetector(store, 30 * 60 * 1000);
    const nowIso = "2026-05-31T11:00:00.000Z"; // 1 hour after base, 15 min after fresh

    const stuck = detector.detect(nowIso);
    const stuckIds = stuck.map((s) => s.attemptId);

    expect(stuckIds).not.toContain("ra_fresh");
  });

  it("does not report waiting attempt as stuck", () => {
    const { db, store } = seedDb();
    const detector = new StuckRunDetector(store, 30 * 60 * 1000);
    const nowIso = "2026-05-31T11:00:00.000Z";

    const stuck = detector.detect(nowIso);
    const stuckIds = stuck.map((s) => s.attemptId);

    expect(stuckIds).not.toContain("ra_waiting");
  });

  it("does not mutate the database", () => {
    const { db, store } = seedDb();
    const detector = new StuckRunDetector(store, 30 * 60 * 1000);
    const nowIso = "2026-05-31T11:00:00.000Z";

    // Capture all statuses before detection
    const before = db
      .prepare("select id, status from run_attempts order by id")
      .all() as Array<{ id: string; status: string }>;

    detector.detect(nowIso);

    // Verify no statuses changed
    const after = db
      .prepare("select id, status from run_attempts order by id")
      .all() as Array<{ id: string; status: string }>;

    expect(after).toEqual(before);

    db.close();
  });
});
