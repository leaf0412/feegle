import type { TriggerEvent } from "../ingress/trigger-event.js";
import { taskToTriggerEvent } from "./scheduler-trigger-event.js";

export interface SchedulerIngress {
  dispatch(event: TriggerEvent): Promise<{ status: "succeeded" | "failed" | "waiting" }>;
}

export class SchedulerRuntimeObserver {
  constructor(
    private readonly deps: {
      ingress: SchedulerIngress;
      idFactory: { triggerEventId(): string };
      clock: { nowIso(): string };
    }
  ) {}

  async beforeTaskRun(input: { taskId: string; taskName: string; kind: string }): Promise<void> {
    await this.deps.ingress.dispatch(
      taskToTriggerEvent({
        triggerEventId: this.deps.idFactory.triggerEventId(),
        receivedAt: this.deps.clock.nowIso(),
        taskId: input.taskId,
        taskName: input.taskName,
        kind: input.kind
      })
    );
  }
}
