import { describe, expect, it } from "vitest";
import { SchedulerRuntimeObserver } from "../../src/features/scheduler/scheduler-runtime-observer.js";

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
      idFactory: { triggerEventId: () => "trg_task_1", runAttemptId: () => "ra_1" },
      clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
    });

    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });

    expect(dispatched).toHaveLength(1);
  });

  it("tracks consecutive dispatch failures and resets on success", async () => {
    const dispatched: unknown[] = [];
    let call = 0;
    const observer = new SchedulerRuntimeObserver({
      ingress: {
        dispatch: async (event) => {
          dispatched.push(event);
          call++;
          // First two calls fail, third succeeds
          return { status: call <= 2 ? ("failed" as const) : ("succeeded" as const) };
        }
      },
      idFactory: { triggerEventId: () => `trg_${call}`, runAttemptId: () => `ra_${call}` },
      clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
    });

    // First failure
    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });
    expect(observer.getConsecutiveFailures("task_1")).toBe(1);

    // Second failure
    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });
    expect(observer.getConsecutiveFailures("task_1")).toBe(2);

    // Third succeeds, counter resets
    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });
    expect(observer.getConsecutiveFailures("task_1")).toBe(0);
  });

  it("includes recovery metadata on dispatch after 2+ consecutive failures", async () => {
    const dispatched: unknown[] = [];
    let call = 0;
    const observer = new SchedulerRuntimeObserver({
      ingress: {
        dispatch: async (event) => {
          dispatched.push(event);
          call++;
          return { status: "failed" };
        }
      },
      idFactory: {
        triggerEventId: () => `trg_${call}`,
        runAttemptId: () => "ra_recovery"
      },
      clock: { nowIso: () => "2026-05-31T00:00:00.000Z" }
    });

    // First failure - no recovery metadata yet
    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });

    // Second failure - still no recovery metadata (2nd consecutive failure detected after dispatch)
    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });

    // Third call - recovery metadata should be present because consecutiveFailures >= 2 from previous failures
    await observer.beforeTaskRun({ taskId: "task_1", taskName: "Daily report", kind: "agent-prompt" });

    const thirdEvent = dispatched[2] as Record<string, unknown>;
    const external = thirdEvent.external as Record<string, unknown>;
    expect(external.recoveryMetadata).toBeDefined();
    expect(external.recoveryMetadata).toEqual({
      source: "scheduler_runtime",
      taskId: "task_1",
      kind: "agent-prompt",
      runAttemptId: "ra_recovery"
    });
  });
});
