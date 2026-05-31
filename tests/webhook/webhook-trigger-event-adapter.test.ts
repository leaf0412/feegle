import { describe, expect, it } from "vitest";
import { webhookPayloadToTriggerEvent } from "../../src/webhook/webhook-trigger-event-adapter.js";

describe("webhook trigger event adapter", () => {
  it("converts a webhook payload to a TriggerEvent", () => {
    const event = webhookPayloadToTriggerEvent({
      triggerEventId: "trg_webhook",
      receivedAt: "2026-05-31T00:00:00.000Z",
      sourceId: "wh_1",
      pluginId: "github",
      headers: { "x-hub-signature": "sha1=abc" },
      payload: { action: "push", ref: "refs/heads/main" }
    });

    expect(event.source.pluginId).toBe("github");
    expect(event.source.triggerType).toBe("inbound");
    expect(event.payloadSummary).toHaveProperty("action", "push");
  });

  it("truncates large payload values in summary", () => {
    const event = webhookPayloadToTriggerEvent({
      triggerEventId: "trg_2",
      receivedAt: "2026-05-31T00:00:00.000Z",
      sourceId: "wh_1",
      pluginId: "github",
      headers: {},
      payload: { description: "a".repeat(300) }
    });

    const summary = event.payloadSummary.description as string;
    expect(summary).toContain("...");
    expect(summary.length).toBeLessThan(250);
  });

  it("redacts known sensitive header patterns in summary", () => {
    const event = webhookPayloadToTriggerEvent({
      triggerEventId: "trg_3",
      receivedAt: "2026-05-31T00:00:00.000Z",
      sourceId: "wh_1",
      pluginId: "github",
      headers: { "authorization": "bearer tok_12345" },
      payload: {}
    });

    expect(event.external).toHaveProperty("headers");
  });
});
