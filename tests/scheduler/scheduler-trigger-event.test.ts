import { describe, expect, it } from "vitest";
import { taskToTriggerEvent } from "@features/scheduler/scheduler-trigger-event.js";

describe("taskToTriggerEvent", () => {
  it("converts a scheduler task run into a runtime trigger event", () => {
    const event = taskToTriggerEvent({
      triggerEventId: "trg_task_1",
      receivedAt: "2026-05-31T00:00:00.000Z",
      taskId: "task_1",
      taskName: "Daily report",
      kind: "agent-prompt"
    });

    expect(event.source).toEqual({
      pluginId: "core",
      adapterId: "scheduler",
      triggerType: "scheduled_workflow"
    });
    expect(event.payloadSummary).toEqual({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });
  });
});
