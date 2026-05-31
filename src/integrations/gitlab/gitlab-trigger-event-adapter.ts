import type { TriggerEvent } from "@core/ingress/trigger-event.js";

const SENSITIVE_KEY_PATTERN = /token|password|secret|authorization|api[_-]?key/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function summarizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  const keys = Object.keys(payload).slice(0, 10);
  for (const key of keys) {
    if (isSensitiveKey(key)) {
      summary[key] = "[REDACTED]";
      continue;
    }
    const value = payload[key];
    if (typeof value === "string" && value.length > 200) {
      summary[key] = value.slice(0, 200) + "...";
    } else if (typeof value === "object" && value !== null) {
      summary[key] = `[${Array.isArray(value) ? "array" : "object"} size=${Object.keys(value as Record<string, unknown>).length}]`;
    } else {
      summary[key] = value;
    }
  }
  if (Object.keys(payload).length > 10) {
    summary["_truncated"] = Object.keys(payload).length - 10;
  }
  return summary;
}

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
    payloadSummary: summarizePayload(input.payload)
  };
}
