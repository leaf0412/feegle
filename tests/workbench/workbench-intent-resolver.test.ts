import { describe, expect, it } from "vitest";
import {
  registerWorkbenchIntentResolver,
  registerWorkbenchCardWorkflowSelector,
  workbenchCardWorkflowId
} from "@features/workbench/workbench-intent-resolver.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import type { TriggerEvent } from "@core/ingress/trigger-event.js";

function makeMessageEvent(overrides: Partial<TriggerEvent["external"]> = {}): TriggerEvent {
  return {
    triggerEventId: "trg_test",
    source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
    receivedAt: "2026-06-01T00:00:00.000Z",
    external: {
      chatId: "oc_test",
      messageId: "om_test",
      resolvedWorkspaceId: "ws_test",
      resolvedProjectId: "proj_test",
      resolvedUserId: "ou_test",
      commandType: "chat",
      ...overrides
    },
    actorHint: { provider: "feishu", externalUserId: "ou_test" },
    conversationHint: { conversationKey: "feishu:oc_test" },
    payloadSummary: {}
  };
}

function makeCardActionEvent(
  actionValue: string,
  overrides: Partial<TriggerEvent["external"]> = {}
): TriggerEvent {
  // actionValue is the raw button value like "act:/workbench discuss" or "act:/other command"
  // Parse it exactly like parsePlatformAction would.
  const body = actionValue.startsWith("act:") ? actionValue.slice(4) : actionValue;
  const [command = "", ...rest] = body.split(/\s+/);
  return {
    triggerEventId: "trg_card_test",
    source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "card_action" },
    receivedAt: "2026-06-01T00:00:00.000Z",
    external: {
      chatId: "oc_test",
      messageId: "om_card_test",
      actionType: "platform_action",
      actionPayload: {
        type: "platform_action",
        action: {
          kind: "act",
          command,
          args: rest.join(" "),
          raw: actionValue
        }
      },
      resolvedWorkspaceId: "ws_test",
      resolvedUserId: "ou_test",
      resolvedProjectId: "proj_test",
      ...overrides
    },
    actorHint: { provider: "feishu", externalUserId: "ou_test" },
    conversationHint: { conversationKey: "feishu:oc_test" },
    payloadSummary: {}
  };
}

describe("workbench intent resolver", () => {
  it("resolves feishu message with chatId to workbench_card intent", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);

    const intent = await registry.resolve(makeMessageEvent());

    expect(intent.kind).toBe("workbench_card");
    expect(intent.workspaceId).toBe("ws_test");
    expect(intent.projectId).toBe("proj_test");
    expect(intent.actor).toEqual({ kind: "user", userId: "ou_test" });
    expect((intent.payload as { chatId: string }).chatId).toBe("oc_test");
    expect((intent.payload as { messageId: string }).messageId).toBe("om_test");
    expect((intent.payload as { conversationKey: string }).conversationKey).toBe("feishu:oc_test");
  });

  it("does not resolve non-feishu events", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);

    const event = makeMessageEvent();
    event.source = { pluginId: "gitlab", adapterId: "webhook", triggerType: "message" };

    await expect(registry.resolve(event)).rejects.toThrow();
  });

  it("does not resolve feishu events without chatId", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);

    const event = makeMessageEvent();
    delete event.external.chatId;

    await expect(registry.resolve(event)).rejects.toThrow();
  });

  it("claims messages before a fallback feishu-message resolver", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);
    registry.register({
      id: "fallback-message",
      canResolve: (e) => e.source.pluginId === "feishu" && e.source.triggerType === "message",
      resolve: () => ({
        intentId: "intent:fallback",
        kind: "chat",
        workspaceId: "ws",
        projectId: null,
        actor: { kind: "system" },
        payload: {}
      })
    });

    const intent = await registry.resolve(makeMessageEvent());
    expect(intent.kind).toBe("workbench_card");
  });

  it("lets requirement messages flow through a more specific resolver registered first", async () => {
    const registry = new IntentResolverRegistry();
    registry.register({
      id: "requirement",
      canResolve: (e) => {
        const raw = e.external.raw;
        return typeof raw === "string" && raw.startsWith("需求：");
      },
      resolve: () => ({
        intentId: "intent:req",
        kind: "requirement_intake",
        workspaceId: "ws",
        projectId: null,
        actor: { kind: "system" },
        payload: {}
      })
    });
    registerWorkbenchIntentResolver(registry);

    const intent = await registry.resolve(makeMessageEvent({ raw: "需求：test" }));
    expect(intent.kind).toBe("requirement_intake");
  });
});

describe("workbench card workflow selector", () => {
  it("selects workbench.card workflow for workbench_card intent", () => {
    const selector = new WorkflowSelector();
    registerWorkbenchCardWorkflowSelector(selector);

    const result = selector.select({
      intentId: "intent:test",
      kind: "workbench_card",
      workspaceId: "ws",
      projectId: null,
      actor: { kind: "system" },
      payload: {}
    });

    expect(result.definitionId).toBe(workbenchCardWorkflowId);
  });

  it("selects workbench.card workflow for workbench_action intent", () => {
    const selector = new WorkflowSelector();
    registerWorkbenchCardWorkflowSelector(selector);

    const result = selector.select({
      intentId: "intent:test",
      kind: "workbench_action",
      workspaceId: "ws",
      projectId: null,
      actor: { kind: "system" },
      payload: {}
    });

    expect(result.definitionId).toBe(workbenchCardWorkflowId);
  });

  it("does not select for non-workbench intents", () => {
    const selector = new WorkflowSelector();
    registerWorkbenchCardWorkflowSelector(selector);

    expect(() => selector.select({
      intentId: "intent:test",
      kind: "chat",
      workspaceId: "ws",
      projectId: null,
      actor: { kind: "system" },
      payload: {}
    })).toThrow();
  });
});

describe("workbench card action intent resolver", () => {
  it("resolves workbench button clicks to workbench_action intent", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);

    const intent = await registry.resolve(makeCardActionEvent("act:/workbench discuss"));

    expect(intent.kind).toBe("workbench_action");
    const payload = intent.payload as { chatId: string; messageId: string; button: string };
    expect(payload.chatId).toBe("oc_test");
    expect(payload.messageId).toBe("om_card_test");
    expect(payload.button).toBe("discuss_requirement");
  });

  it("extracts payload for revise_plan action", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);

    const intent = await registry.resolve(makeCardActionEvent("act:/workbench revise_plan"));
    const payload = intent.payload as { button: string };
    expect(payload.button).toBe("revise_plan");
  });

  it("does not match non-workbench card actions", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);
    registry.register({
      id: "fallback",
      canResolve: (e) => e.source.triggerType === "card_action",
      resolve: () => ({
        intentId: "intent:fallback",
        kind: "control_action",
        workspaceId: "ws",
        projectId: null,
        actor: { kind: "system" },
        payload: {}
      })
    });

    const intent = await registry.resolve(makeCardActionEvent("act:/other command"));
    expect(intent.kind).toBe("control_action");
  });

  it("claims workbench card actions before fallback resolver", async () => {
    const registry = new IntentResolverRegistry();
    registerWorkbenchIntentResolver(registry);
    registry.register({
      id: "fallback",
      canResolve: (e) => e.source.triggerType === "card_action",
      resolve: () => ({
        intentId: "intent:fallback",
        kind: "control_action",
        workspaceId: "ws",
        projectId: null,
        actor: { kind: "system" },
        payload: {}
      })
    });

    const intent = await registry.resolve(makeCardActionEvent("act:/workbench generate_plan"));
    expect(intent.kind).toBe("workbench_action");
  });
});
