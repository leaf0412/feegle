import { createHmac, timingSafeEqual } from "node:crypto";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

export function verifyWebhookSignature(input: {
  rawBody: string;
  secret: string;
  signature: string;
}): void {
  const expected = createHmac("sha256", input.secret).update(input.rawBody).digest("hex");
  const sigBuffer = Buffer.from(input.signature);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
    throw new Error("invalid webhook signature");
  }
}

export function webhookPayloadToTriggerEvent(input: {
  triggerEventId: string;
  receivedAt: string;
  sourceId: string;
  pluginId: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
}): TriggerEvent {
  return {
    triggerEventId: input.triggerEventId,
    source: {
      pluginId: input.pluginId,
      adapterId: "webhook",
      triggerType: "inbound"
    },
    receivedAt: input.receivedAt,
    external: {
      sourceId: input.sourceId,
      headers: input.headers
    },
    payloadSummary: summarizePayload(input.payload)
  };
}

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
