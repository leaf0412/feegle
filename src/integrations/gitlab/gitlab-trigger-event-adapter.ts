import type { TriggerEvent } from "@core/ingress/trigger-event.js";

export function gitlabEventToTriggerEvent(input: {
  triggerEventId: string;
  receivedAt: string;
  host: string;
  projectId: number;
  eventType: string;
  resourceType: "issue" | "merge_request";
  resourceIid: number;
  action: string;
  payload: Record<string, unknown>;
}): TriggerEvent {
  return {
    triggerEventId: input.triggerEventId,
    source: {
      pluginId: "gitlab",
      adapterId: "webhook",
      triggerType: input.eventType
    },
    receivedAt: input.receivedAt,
    external: {
      host: input.host,
      projectId: input.projectId,
      resourceType: input.resourceType,
      resourceIid: input.resourceIid,
      action: input.action
    },
    actorHint: { kind: "system" },
    conversationHint: {
      conversationKey: `gitlab:${input.host}:${input.projectId}:${input.resourceType}:${input.resourceIid}`
    },
    payloadSummary: {
      action: input.action,
      resourceType: input.resourceType,
      resourceIid: input.resourceIid,
      title: typeof input.payload.title === "string" ? input.payload.title : undefined
    }
  };
}
