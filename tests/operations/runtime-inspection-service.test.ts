import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb } from "@infra/app/runtime-db.js";
import { RuntimeStore } from "@core/runtime/runtime-store.js";
import { RuntimeInspectionService } from "@core/operations/runtime-inspection-service.js";

describe("RuntimeInspectionService", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-inspect-"));
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

    // Workflow instance (waiting)
    store.createWorkflowInstance({
      id: "wf_1",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "demo.workflow",
      definitionVersion: 1,
      status: "waiting",
      now
    });

    // Another workflow instance (running)
    store.createWorkflowInstance({
      id: "wf_2",
      workspaceId: "ws_1",
      projectId: null,
      definitionId: "demo.workflow",
      definitionVersion: 1,
      status: "running",
      now
    });

    // Run attempt for wf_1
    store.createRunAttempt({
      id: "ra_1",
      workflowInstanceId: "wf_1",
      status: "waiting",
      triggerEventId: null,
      now
    });

    // Run attempt for wf_2 (running)
    store.createRunAttempt({
      id: "ra_2",
      workflowInstanceId: "wf_2",
      status: "running",
      triggerEventId: null,
      now
    });

    // Step state for wf_1
    store.createStepState({
      id: "step_1",
      workflowInstanceId: "wf_1",
      runAttemptId: "ra_1",
      stepId: "approve",
      status: "waiting",
      input: { action: "approve" },
      now
    });

    // Step state for wf_2
    store.createStepState({
      id: "step_2",
      workflowInstanceId: "wf_2",
      runAttemptId: "ra_2",
      stepId: "execute",
      status: "running",
      input: { command: "build" },
      now
    });

    // Effect execution for ra_1
    store.createEffectExecution({
      id: "eff_1",
      runAttemptId: "ra_1",
      stepStateId: "step_1",
      pluginId: "core",
      effectType: "notify",
      status: "failed",
      idempotencyKey: null,
      inputSummary: { channel: "feishu" },
      now
    });

    return { db, store, now };
  }

  describe("RuntimeStore read-only queries", () => {
    it("listWorkflowSummaries returns summaries for a workspace without mutating", () => {
      const { db, store } = seedDb();

      const summaries = store.listWorkflowSummaries("ws_1");
      expect(summaries).toHaveLength(2);
      expect(summaries[0]).toMatchObject({
        id: expect.any(String),
        status: expect.any(String),
        definitionId: "demo.workflow"
      });

      // Verify no mutation: statuses should remain unchanged
      const wf1 = db
        .prepare("select status from workflow_instances where id = ?")
        .get("wf_1") as { status: string };
      expect(wf1.status).toBe("waiting");

      db.close();
    });

    it("listRunAttempts returns attempts for a workflow instance", () => {
      const { store } = seedDb();

      const attempts = store.listRunAttempts("wf_1");
      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toMatchObject({
        id: "ra_1",
        status: "waiting",
        workflowInstanceId: "wf_1"
      });
    });

    it("listStepSummaries returns steps for a workflow instance", () => {
      const { store } = seedDb();

      const steps = store.listStepSummaries("wf_1");
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        id: "step_1",
        stepId: "approve",
        status: "waiting",
        runAttemptId: "ra_1"
      });
    });

    it("listEffectSummaries returns effects for a run attempt", () => {
      const { store } = seedDb();

      const effects = store.listEffectSummaries("ra_1");
      expect(effects).toHaveLength(1);
      expect(effects[0]).toMatchObject({
        id: "eff_1",
        pluginId: "core",
        effectType: "notify",
        status: "failed",
        runAttemptId: "ra_1"
      });
    });

    it("listRunningAttemptsOlderThan returns only stale running attempts", () => {
      const { store } = seedDb();
      const now = "2026-05-31T11:00:00.000Z"; // 1 hour later
      const maxAgeMs = 30 * 60 * 1000; // 30 minutes

      // Only ra_2 is 'running' and created at 10:00, which is > 30 min ago
      const stuck = store.listRunningAttemptsOlderThan(now, maxAgeMs);
      expect(stuck).toHaveLength(1);
      expect(stuck[0]).toMatchObject({
        id: "ra_2",
        workflowInstanceId: "wf_2",
        status: "running"
      });

      // ra_1 has status 'waiting' — should not be returned
      const stuckIds = stuck.map((s) => s.id);
      expect(stuckIds).not.toContain("ra_1");
    });

    it("listRunningAttemptsOlderThan excludes fresh running attempts", () => {
      const { store } = seedDb();
      const now = "2026-05-31T10:05:00.000Z"; // only 5 min later
      const maxAgeMs = 30 * 60 * 1000;

      // ra_2 is only 5 min old — not stale
      const stuck = store.listRunningAttemptsOlderThan(now, maxAgeMs);
      expect(stuck).toHaveLength(0);
    });
  });

  describe("RuntimeInspectionService.inspect()", () => {
    it("returns correct workflow totals from store", async () => {
      const { db, store } = seedDb();
      const service = new RuntimeInspectionService(store);

      const result = await service.inspect("ws_1");
      expect(result.totalWorkflows).toBe(2);
      expect(result.waitingCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.workflows).toHaveLength(2);
      expect(result.workflows[0]).toMatchObject({
        id: expect.any(String),
        status: expect.any(String),
        currentStepId: null,
        definitionId: "demo.workflow"
      });
      db.close();
    });

    it("returns zero totals for workspace with no workflows", async () => {
      const db = openRuntimeDb(join(tempDir, "feegle.db"));
      const now = "2026-05-31T10:00:00.000Z";
      db.prepare(
        "insert into workspaces (id, name, created_at, updated_at) values (?, ?, ?, ?)"
      ).run("ws_empty", "Empty", now, now);
      const store = new RuntimeStore(db);
      const service = new RuntimeInspectionService(store);

      const result = await service.inspect("ws_empty");
      expect(result.totalWorkflows).toBe(0);
      expect(result.waitingCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.workflows).toHaveLength(0);
      db.close();
    });

    it("returns waiting workflow count correctly when one waiting workflow exists", async () => {
      const db = openRuntimeDb(join(tempDir, "feegle.db"));
      const store = new RuntimeStore(db);
      const now = "2026-05-31T10:00:00.000Z";

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
        status: "waiting",
        now
      });

      const service = new RuntimeInspectionService(store);
      const result = await service.inspect("ws_1");

      expect(result.totalWorkflows).toBe(1);
      expect(result.waitingCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.workflows[0]).toMatchObject({
        id: "wf_1",
        status: "waiting",
        currentStepId: null,
        definitionId: "demo.workflow"
      });

      db.close();
    });
  });
});
