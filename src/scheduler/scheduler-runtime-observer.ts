import type { TriggerEvent } from "../ingress/trigger-event.js";
import { taskToTriggerEvent } from "./scheduler-trigger-event.js";

export interface SchedulerIngress {
  dispatch(event: TriggerEvent): Promise<{ status: "succeeded" | "failed" | "waiting" }>;
}

export class SchedulerRuntimeObserver {
  private readonly consecutiveFailures = new Map<string, number>();

  constructor(
    private readonly deps: {
      ingress: SchedulerIngress;
      idFactory: { triggerEventId(): string; runAttemptId(): string };
      clock: { nowIso(): string };
    }
  ) {}

  getConsecutiveFailures(taskId: string): number {
    return this.consecutiveFailures.get(taskId) ?? 0;
  }

  async beforeTaskRun(input: { taskId: string; taskName: string; kind: string }): Promise<void> {
    const consecutive = this.consecutiveFailures.get(input.taskId) ?? 0;
    const recoveryMetadata =
      consecutive >= 2
        ? {
            source: "scheduler_runtime",
            taskId: input.taskId,
            kind: input.kind,
            runAttemptId: this.deps.idFactory.runAttemptId(),
          }
        : undefined;

    const event = taskToTriggerEvent({
      triggerEventId: this.deps.idFactory.triggerEventId(),
      receivedAt: this.deps.clock.nowIso(),
      taskId: input.taskId,
      taskName: input.taskName,
      kind: input.kind,
      recoveryMetadata,
    });

    const result = await this.deps.ingress.dispatch(event);

    if (result.status === "failed") {
      this.consecutiveFailures.set(input.taskId, consecutive + 1);
    } else {
      this.consecutiveFailures.delete(input.taskId);
    }
  }
}
