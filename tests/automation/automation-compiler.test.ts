import { describe, expect, it } from "vitest";
import { compileAutomation } from "@features/automation/automation-compiler.js";

describe("automation compiler", () => {
  it("compiles a recovery automation into a workflow definition", () => {
    const def = compileAutomation({
      id: "auto_1", workspaceId: "ws_1", name: "Auto Recover",
      trigger: "on_workflow_failed", conditionType: "always", conditionValue: "",
      effect: "trigger_recovery", enabled: true,
      createdAt: "2026-05-31T00:00:00.000Z", updatedAt: "2026-05-31T00:00:00.000Z"
    });

    expect(def.definitionId).toBe("automation.auto_1");
    expect(def.steps).toHaveLength(1);
  });
});
