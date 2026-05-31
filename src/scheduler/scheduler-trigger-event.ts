import type { TriggerEvent } from "../ingress/trigger-event.js";

export function taskToTriggerEvent(input: {
  triggerEventId: string;
  receivedAt: string;
  taskId: string;
  taskName: string;
  kind: string;
  recoveryMetadata?: Record<string, unknown>;
}): TriggerEvent {
  return {
    triggerEventId: input.triggerEventId,
    source: {
      pluginId: "core",
      adapterId: "scheduler",
      triggerType: "scheduled_workflow"
    },
    receivedAt: input.receivedAt,
    external: {
      taskId: input.taskId,
      taskName: input.taskName,
      kind: input.kind,
      ...(input.recoveryMetadata ? { recoveryMetadata: input.recoveryMetadata } : {})
    },
    actorHint: { kind: "scheduler" },
    payloadSummary: {
      taskId: input.taskId,
      taskName: input.taskName,
      kind: input.kind
    }
  };
}
