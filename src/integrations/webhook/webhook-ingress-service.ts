import type { WebhookSourceRecord } from "./webhook-source-store.js";
import { webhookPayloadToTriggerEvent } from "./webhook-trigger-event-adapter.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";
import type { SecretResolver } from "@core/security/secret-resolver.js";

export { SecretResolver } from "@core/security/secret-resolver.js";
// Re-export only for legacy test compatibility; prefer importing from @core/security/secret-resolver.js directly.
export type WebhookSecretResolver = SecretResolver;

export interface WebhookSourceLookup {
  getById(id: string): WebhookSourceRecord | undefined;
}

export interface WebhookIngressDeps {
  sourceStore: WebhookSourceLookup;
  verifySignature: (input: { rawBody: string; secret: string; signature: string }) => void;
  ingressDispatcher: { dispatch(event: TriggerEvent): Promise<{ status: string }> };
  idFactory: { triggerEventId(): string };
  clock: { nowIso(): string };
}

export class WebhookIngressService {
  constructor(
    private readonly deps: WebhookIngressDeps,
    private readonly secretResolver: SecretResolver
  ) {}

  async handleWebhook(input: {
    sourceId: string;
    pluginId: string;
    headers: Record<string, string>;
    rawBody: string;
    payload: Record<string, unknown>;
    receivedAt: string;
  }): Promise<{ status: "succeeded" | "failed"; detail: string }> {
    // 1. Look up source by sourceId
    const source = this.deps.sourceStore.getById(input.sourceId);
    if (!source) {
      return { status: "failed", detail: `webhook source not found: ${input.sourceId}` };
    }
    if (!source.enabled) {
      return { status: "failed", detail: `webhook source disabled: ${input.sourceId}` };
    }

    // 2. If source has secretRef, resolve the secret and verify signature
    if (source.secretRef) {
      const result = await this.secretResolver.resolve(source.secretRef, {
        workspaceId: "",
        pluginId: input.pluginId
      });
      if (result.status !== "resolved") {
        return { status: "failed", detail: `webhook secret resolution failed: ${source.secretRef} (${result.status}: ${result.reason})` };
      }
      const secret = result.value;

      const signature = this.extractSignature(input.headers);
      if (!signature) {
        return { status: "failed", detail: `webhook signature missing in headers: ${input.sourceId}` };
      }

      try {
        this.deps.verifySignature({ rawBody: input.rawBody, secret, signature });
      } catch (err) {
        return {
          status: "failed",
          detail: err instanceof Error ? err.message : "invalid webhook signature"
        };
      }
    }

    // 3. Convert to TriggerEvent
    const triggerEvent = webhookPayloadToTriggerEvent({
      triggerEventId: this.deps.idFactory.triggerEventId(),
      receivedAt: input.receivedAt,
      sourceId: input.sourceId,
      pluginId: input.pluginId,
      headers: input.headers,
      payload: input.payload
    });

    // 4. Dispatch through ingress
    const result = await this.deps.ingressDispatcher.dispatch(triggerEvent);
    return {
      status: result.status === "failed" ? "failed" : "succeeded",
      detail: result.status
    };
  }

  private extractSignature(headers: Record<string, string>): string | null {
    // Check common webhook signature header names
    const signatureHeaders = [
      "x-hub-signature-256",
      "x-hub-signature",
      "x-webhook-signature",
      "x-signature"
    ];
    for (const header of signatureHeaders) {
      const value = headers[header] ?? headers[header.toLowerCase()];
      if (value) {
        // Strip prefix if present (e.g. "sha256=" from GitHub)
        const prefixMatch = value.match(/^(?:sha\d+[=-])?(.+)/i);
        return prefixMatch ? prefixMatch[1] : value;
      }
    }
    return null;
  }
}
