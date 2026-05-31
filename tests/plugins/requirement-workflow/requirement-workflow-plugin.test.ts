import { describe, expect, it } from "vitest";
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
