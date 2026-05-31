import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { RequirementWorkflowStore } from "@plugins/requirement-workflow/requirement-workflow-store.js";
import {
  requirementWorkflowStatuses,
  isRequirementWorkflowStatus
} from "@plugins/requirement-workflow/requirement-workflow-models.js";

describe("requirement workflow models", () => {
  it("defines the full platform-neutral lifecycle", () => {
    expect(requirementWorkflowStatuses).toEqual([
      "intake_received",
      "planning",
      "plan_reviewing",
      "plan_approved",
      "executing",
      "implementation_ready",
      "verifying",
      "accepted",
      "cancelled",
      "failed"
    ]);
    expect(isRequirementWorkflowStatus("plan_reviewing")).toBe(true);
    expect(isRequirementWorkflowStatus("workbench_plan_approve")).toBe(false);
  });
});

describe("RequirementWorkflowStore", () => {
  let root: string;
  let db: RuntimeDb;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "feegle-requirement-workflow-"));
    db = openRuntimeDb(join(root, "runtime.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("creates and reads a requirement workflow record", () => {
    const store = new RequirementWorkflowStore(db);
    const record = store.createIntake({
      workspaceId: "workspace-default",
      projectId: null,
      conversationKey: "feishu:oc_1",
      requesterUserId: "user_1",
      title: "Add smoke workflow",
      requirementText: "Create a workflow and verify it"
    });

    expect(record).toMatchObject({
      workspaceId: "workspace-default",
      status: "intake_received",
      currentPlanVersion: 0
    });
    expect(store.get(record.requirementId)).toEqual(record);
  });

  it("setStatus enforces the expected current status", () => {
    const store = new RequirementWorkflowStore(db);
    const record = store.createIntake({
      workspaceId: "workspace-default",
      projectId: null,
      conversationKey: "feishu:oc_1",
      requesterUserId: "user_1",
      title: "t",
      requirementText: "r"
    });

    expect(() =>
      store.setStatus({ requirementId: record.requirementId, expected: "planning", next: "plan_reviewing" })
    ).toThrow("expected planning, found intake_received");

    const updated = store.setStatus({ requirementId: record.requirementId, expected: "intake_received", next: "planning" });
    expect(updated.status).toBe("planning");
    expect(store.get(record.requirementId)?.status).toBe("planning");
  });
});
