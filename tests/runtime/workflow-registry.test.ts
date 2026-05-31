import { describe, expect, it } from "vitest";
import {
  runAttemptStatuses,
  stepStatuses,
  type StepResult,
  type WorkflowDefinition
} from "../../src/core/runtime/runtime-models.js";

describe("runtime models", () => {
  it("defines statuses needed for durable recovery and waiting workflows", () => {
    expect(runAttemptStatuses).toContain("interrupted");
    expect(stepStatuses).toEqual(["pending", "running", "waiting", "succeeded", "failed", "skipped", "cancelled"]);
  });

  it("represents wait results without treating them as failures", () => {
    const result: StepResult = {
      kind: "wait",
      reason: "needs approval",
      waitFor: { kind: "control_action", action: "approve_step" }
    };

    expect(result.kind).toBe("wait");
  });

  it("keeps workflow definitions code-defined for the first runtime stage", () => {
    const definition: WorkflowDefinition = {
      definitionId: "test.echo",
      version: 1,
      concurrencyPolicy: "reject_if_running",
      steps: [
        {
          stepId: "echo",
          run: async () => ({ kind: "complete", output: { ok: true } })
        }
      ]
    };

    expect(definition.steps[0]?.stepId).toBe("echo");
  });
});
