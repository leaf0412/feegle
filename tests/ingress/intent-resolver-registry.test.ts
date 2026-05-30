import { describe, expect, it } from "vitest";
import { intentKinds } from "../../src/ingress/intent.js";
import type { Intent } from "../../src/ingress/intent.js";
import { IntentResolverRegistry } from "../../src/ingress/intent-resolver-registry.js";
import { triggerEventModelVersion } from "../../src/ingress/trigger-event.js";
import type { TriggerEvent } from "../../src/ingress/trigger-event.js";

describe("ingress models", () => {
  it("exports runtime markers so missing model modules are caught by tests", () => {
    expect(intentKinds).toContain("chat");
    expect(triggerEventModelVersion).toBe(1);
  });

  it("captures external payloads without platform enums in core", () => {
    const event: TriggerEvent = {
      triggerEventId: "trg_1",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-30T00:00:00.000Z",
      external: { messageId: "om_1" },
      payloadSummary: { textLength: 12 }
    };

    expect(event.source.triggerType).toBe("message");
  });

  it("represents resolved core intent separately from raw trigger data", () => {
    const intent: Intent = {
      intentId: "intent_1",
      kind: "chat",
      workspaceId: "ws_1",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { text: "hello" }
    };

    expect(intent.kind).toBe("chat");
  });
});

describe("IntentResolverRegistry", () => {
  it("uses the first resolver that can turn a trigger into an intent", async () => {
    const registry = new IntentResolverRegistry();
    registry.register({
      id: "feishu-chat",
      canResolve: (event) => event.source.pluginId === "feishu",
      resolve: async () => ({
        intentId: "intent_1",
        kind: "chat",
        workspaceId: "ws_1",
        projectId: null,
        actor: { kind: "user", userId: "user_1" },
        payload: { text: "hello" }
      })
    });

    const intent = await registry.resolve({
      triggerEventId: "trg_1",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-30T00:00:00.000Z",
      external: {},
      payloadSummary: {}
    });

    expect(intent.kind).toBe("chat");
  });
});
