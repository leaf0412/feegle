import { describe, expect, it } from "vitest";
import { SchedulerRuntimeObserver } from "../../src/scheduler/scheduler-runtime-observer.js";

describe("SchedulerRuntimeObserver", () => {
  it("dispatches scheduled trigger events without changing scheduler outcome", async () => {
    const dispatched: unknown[] = [];
    const observer = new SchedulerRuntimeObserver({
      ingress: {
        dispatch: async (event) => {
          dispatched.push(event);
          return { status: "succeeded" };
        }
      },
      idFactory: { triggerEventId: () => "trg_task_1" },
      clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
    });

    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });

    expect(dispatched).toHaveLength(1);
  });
});
