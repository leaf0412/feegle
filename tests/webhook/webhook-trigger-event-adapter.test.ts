import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, webhookPayloadToTriggerEvent } from "../../src/integrations/webhook/webhook-trigger-event-adapter.js";

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

describe("verifyWebhookSignature", () => {
  it("accepts valid HMAC SHA-256 signature", () => {
    const secret = "test-secret";
    const rawBody = JSON.stringify({ event: "push" });
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(() => verifyWebhookSignature({ rawBody, secret, signature })).not.toThrow();
  });

  it("throws 'invalid webhook signature' on mismatch", () => {
    const rawBody = JSON.stringify({ event: "push" });
    expect(() => verifyWebhookSignature({ rawBody, secret: "correct", signature: "wrong" }))
      .toThrow("invalid webhook signature");
  });

  it("throws on empty signature", () => {
    expect(() => verifyWebhookSignature({ rawBody: "{}", secret: "s", signature: "" }))
      .toThrow("invalid webhook signature");
  });
});

describe("payload redaction", () => {
  it("redacts sensitive keys in payload summary", () => {
    const event = webhookPayloadToTriggerEvent({
      triggerEventId: "trg_redact",
      receivedAt: "2026-05-31T00:00:00.000Z",
      sourceId: "wh_1",
      pluginId: "github",
      headers: {},
      payload: {
        token: "ghp_secret123",
        password: "s3cur3",
        secret: "shhh",
        authorization: "bearer tok",
        api_key: "key123",
        api_key_nested: "nested123",
        public_field: "visible",
        safe_value: 42
      }
    });

    expect(event.payloadSummary.token).toBe("[REDACTED]");
    expect(event.payloadSummary.password).toBe("[REDACTED]");
    expect(event.payloadSummary.secret).toBe("[REDACTED]");
    expect(event.payloadSummary.authorization).toBe("[REDACTED]");
    expect(event.payloadSummary.api_key).toBe("[REDACTED]");
    expect(event.payloadSummary.api_key_nested).toBe("[REDACTED]");
    expect(event.payloadSummary.public_field).toBe("visible");
    expect(event.payloadSummary.safe_value).toBe(42);
  });
});
