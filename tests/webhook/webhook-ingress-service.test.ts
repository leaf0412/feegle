import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { WebhookIngressService } from "@integrations/webhook/webhook-ingress-service.js";
import type { SecretResolver, SecretResolverContext } from "@core/security/secret-resolver.js";
import type { WebhookSourceRecord } from "@integrations/webhook/webhook-source-store.js";
import { verifyWebhookSignature } from "@integrations/webhook/webhook-trigger-event-adapter.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

function makeSource(overrides: Partial<WebhookSourceRecord> = {}): WebhookSourceRecord {
  return {
    id: "wh_1",
    name: "GitHub",
    pluginId: "webhook",
    secretRef: "secret:webhook/github",
    enabled: true,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z",
    ...overrides
  };
}

function makeFakeSourceStore(sources: WebhookSourceRecord[]) {
  const map = new Map(sources.map((s) => [s.id, s]));
  return {
    getById: (id: string) => map.get(id),
    create: vi.fn(),
    disable: vi.fn()
  };
}

function makeFakeSecretResolver(secrets: Record<string, string>): SecretResolver {
  return {
    async resolve(ref: string, _context: SecretResolverContext) {
      const value = secrets[ref];
      if (value === undefined) {
        return { status: "missing", reason: `no secret stored for ${ref}` };
      }
      return { status: "resolved", value };
    }
  };
}

let idCounter = 0;
function makeFakeIdFactory() {
  return {
    triggerEventId: () => `trg_${++idCounter}`
  };
}

function makeFakeClock(iso: string) {
  return { nowIso: () => iso };
}

const MOCK_NOW = "2026-05-31T12:00:00.000Z";

describe("WebhookIngressService", () => {
  it("rejects invalid signatures before dispatch", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: "succeeded" });
    const source = makeSource({ secretRef: "secret:webhook/github" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({ "secret:webhook/github": "correct-secret" })
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: { "x-hub-signature-256": "bad-signature" },
      rawBody: JSON.stringify({ action: "deploy" }),
      payload: { action: "deploy" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("failed");
    expect(result.detail).toBe("invalid webhook signature");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches with valid signature", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: "succeeded" });
    const secret = "correct-secret";
    const rawBody = JSON.stringify({ action: "deploy", token: "secret-token" });
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    const source = makeSource({ secretRef: "secret:webhook/github" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({ "secret:webhook/github": secret })
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: { "x-hub-signature-256": signature },
      rawBody,
      payload: { action: "deploy", token: "secret-token" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("succeeded");
    expect(dispatch).toHaveBeenCalledTimes(1);

    const dispatchedEvent = dispatch.mock.calls[0][0] as TriggerEvent;
    expect(dispatchedEvent.triggerEventId).toMatch(/^trg_/);
    expect(dispatchedEvent.source.pluginId).toBe("webhook");
    expect(dispatchedEvent.source.adapterId).toBe("webhook");
    expect(dispatchedEvent.source.triggerType).toBe("inbound");
    expect(dispatchedEvent.payloadSummary.token).toBe("[REDACTED]");
  });

  it("returns failed for missing signature header", async () => {
    const dispatch = vi.fn();
    const source = makeSource({ secretRef: "secret:webhook/github" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({ "secret:webhook/github": "correct-secret" })
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: {}, // no signature headers
      rawBody: JSON.stringify({ action: "deploy" }),
      payload: { action: "deploy" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("signature missing");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns failed for disabled source", async () => {
    const dispatch = vi.fn();
    const source = makeSource({ enabled: false });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({})
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: {},
      rawBody: JSON.stringify({ action: "deploy" }),
      payload: { action: "deploy" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("failed");
    expect(result.detail).toBe("webhook source disabled: wh_1");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("returns failed for unknown sourceId", async () => {
    const dispatch = vi.fn();
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({})
    );

    const result = await service.handleWebhook({
      sourceId: "nonexistent",
      pluginId: "webhook",
      headers: {},
      rawBody: JSON.stringify({ action: "deploy" }),
      payload: { action: "deploy" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("failed");
    expect(result.detail).toBe("webhook source not found: nonexistent");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("skips verification for source with no secretRef", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: "succeeded" });
    const source = makeSource({ secretRef: "" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({})
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: {},
      rawBody: JSON.stringify({ action: "deploy" }),
      payload: { action: "deploy" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("succeeded");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("returns failed when secret resolver returns missing", async () => {
    const dispatch = vi.fn();
    const source = makeSource({ secretRef: "secret:webhook/github" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({}) // no matching secret
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: { "x-hub-signature-256": "some-sig" },
      rawBody: JSON.stringify({ action: "deploy" }),
      payload: { action: "deploy" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("failed");
    expect(result.detail).toContain("webhook secret resolution failed: secret:webhook/github");
    expect(result.detail).toContain("missing:");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("redacts sensitive fields in dispatched payload summary", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: "succeeded" });
    const secret = "correct-secret";
    const rawBody = JSON.stringify({
      action: "push",
      token: "ghp_topsecret",
      password: "s3cur3",
      ref: "refs/heads/main"
    });
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    const source = makeSource({ secretRef: "secret:webhook/github" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({ "secret:webhook/github": secret })
    );

    await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "github",
      headers: { "x-hub-signature-256": signature },
      rawBody,
      payload: { action: "push", token: "ghp_topsecret", password: "s3cur3", ref: "refs/heads/main" },
      receivedAt: MOCK_NOW
    });

    const event = dispatch.mock.calls[0][0] as TriggerEvent;
    expect(event.payloadSummary.token).toBe("[REDACTED]");
    expect(event.payloadSummary.password).toBe("[REDACTED]");
    expect(event.payloadSummary.action).toBe("push");
    expect(event.payloadSummary.ref).toBe("refs/heads/main");
  });

  it("returns failed when ingress dispatcher returns failed", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: "failed" });
    const source = makeSource({ secretRef: "" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({})
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: {},
      rawBody: JSON.stringify({ action: "deploy" }),
      payload: { action: "deploy" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("failed");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("accepts signature from x-webhook-signature header", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: "succeeded" });
    const secret = "correct-secret";
    const rawBody = JSON.stringify({ event: "ping" });
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    const source = makeSource({ secretRef: "secret:webhook/github" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({ "secret:webhook/github": secret })
    );

    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: { "x-webhook-signature": signature },
      rawBody,
      payload: { event: "ping" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("succeeded");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("strips sha256= prefix from signature header", async () => {
    const dispatch = vi.fn().mockResolvedValue({ status: "succeeded" });
    const secret = "correct-secret";
    const rawBody = JSON.stringify({ event: "push" });
    const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

    const source = makeSource({ secretRef: "secret:webhook/github" });
    const service = new WebhookIngressService(
      {
        sourceStore: makeFakeSourceStore([source]),
        verifySignature: verifyWebhookSignature,
        ingressDispatcher: { dispatch },
        idFactory: makeFakeIdFactory(),
        clock: makeFakeClock(MOCK_NOW)
      },
      makeFakeSecretResolver({ "secret:webhook/github": secret })
    );

    // GitHub-style signature: "sha256=<hex>"
    const result = await service.handleWebhook({
      sourceId: "wh_1",
      pluginId: "webhook",
      headers: { "x-hub-signature-256": `sha256=${signature}` },
      rawBody,
      payload: { event: "push" },
      receivedAt: MOCK_NOW
    });

    expect(result.status).toBe("succeeded");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
