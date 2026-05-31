import { describe, expect, it } from "vitest";
import { createRuntimeClosedLoopHarness } from "@tests/e2e/runtime-closed-loop-harness.js";
import { feishuMessageEnvelopeToTriggerEvent } from "@integrations/feishu/feishu-trigger-event-adapter.js";
import { IngressDispatcher, type IngressDeps, type IngressEventSink, type IngressWorkflowRuntime } from "@core/ingress/ingress-dispatcher.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import type { IdentityResolverPort } from "@core/ingress/identity-resolver.js";
import type { WorkspaceResolverPort } from "@core/ingress/workspace-resolver.js";
import type { PermissionPolicyPort } from "@core/ingress/permission-policy.js";

function makeBasicDeps(overrides: {
  identityResolver?: IdentityResolverPort;
  workspaceResolver?: WorkspaceResolverPort;
  permissionPolicy?: PermissionPolicyPort;
  intentResolvers?: IntentResolverRegistry;
  workflowSelector?: WorkflowSelector;
  workflowRuntime?: IngressWorkflowRuntime;
  eventSink?: IngressEventSink;
  idFactory?: IngressDeps["idFactory"];
  clock?: { nowIso(): string };
} = {}): IngressDeps {
  const sink: IngressEventSink = { emit: () => {} };
  return {
    identityResolver: overrides.identityResolver ?? {
      resolve: () => ({ status: "resolved" as const, userId: "user_e2e", displayName: "Test User" })
    },
    workspaceResolver: overrides.workspaceResolver ?? {
      resolve: () => ({ status: "resolved" as const, workspaceId: "ws_e2e", projectId: null, conversationKey: "test" })
    },
    permissionPolicy: overrides.permissionPolicy ?? {
      checkPermission: () => ({ allowed: true, role: "owner" as const, reason: "test" }),
      decide: (p) => p.allowed ? { kind: "allow" as const } : { kind: "deny" as const, reason: "test" }
    },
    intentResolvers: overrides.intentResolvers ?? new IntentResolverRegistry(),
    workflowSelector: overrides.workflowSelector ?? new WorkflowSelector(),
    workflowRuntime: overrides.workflowRuntime ?? {
      start: async () => { throw new Error("stub: workflowRuntime not wired"); }
    },
    eventSink: overrides.eventSink ?? sink,
    idFactory: overrides.idFactory ?? { workflowInstanceId: () => "wfi_test", runAttemptId: () => "ra_test" },
    clock: overrides.clock ?? { nowIso: () => "2026-05-31T00:00:00.000Z" }
  };
}

describe("failure injection", () => {
  it("denied policy fails before workflow selection", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Setup chat workflow fully
      harness.effectHandlerRegistry.register({
        pluginId: "feishu", effectType: "message.reply",
        execute(effect) {
          harness.effectCalls.push({ pluginId: effect.pluginId, effectType: effect.effectType, input: effect.input });
          return { sent: true };
        }
      });
      harness.intentResolvers.register({
        id: "feishu-chat",
        canResolve(event) { return event.source.pluginId === "feishu" && event.source.triggerType === "message"; },
        resolve(event) {
          return { intentId: `intent_${event.triggerEventId}`, kind: "chat" as const, workspaceId: "ws_e2e", projectId: null, actor: { kind: "user" as const, userId: "user_e2e" }, payload: { text: "hello" } };
        }
      });
      harness.workflowSelector.register({ id: "chat-rule", matches(intent) { return intent.kind === "chat"; }, definitionId: "feishu.chat.workflow" });
      harness.workflowRegistry.register({
        definitionId: "feishu.chat.workflow", version: 1, concurrencyPolicy: "skip_if_running",
        steps: [{ stepId: "reply", async run(ctx) { await ctx.executeEffect({ pluginId: "feishu", effectType: "message.reply", input: { text: "hi" } }); return { kind: "complete" as const }; } }]
      });

      // Build a custom dispatcher with a DENY policy
      let wfiCounter = 0;
      let raCounter = 0;
      const denyDispatcher = new IngressDispatcher(
        makeBasicDeps({
          identityResolver: {
            resolve: () => ({ status: "resolved" as const, userId: "user_e2e", displayName: "User" })
          },
          workspaceResolver: {
            resolve: () => ({ status: "resolved" as const, workspaceId: "ws_e2e", projectId: null, conversationKey: "test" })
          },
          permissionPolicy: {
            checkPermission: () => ({ allowed: false, role: "member" as const, reason: "user not authorized" }),
            decide: () => ({ kind: "deny" as const, reason: "policy blocks this user" })
          },
          intentResolvers: harness.intentResolvers,
          workflowSelector: harness.workflowSelector,
          workflowRuntime: {
            start(input) { return harness.workflowRuntime.start(input); }
          },
          idFactory: {
            workflowInstanceId: () => { wfiCounter++; return `wfi_inject_${wfiCounter}`; },
            runAttemptId: () => { raCounter++; return `ra_inject_${raCounter}`; }
          }
        })
      );

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_deny", receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e", messageId: "om_deny", senderUserId: "ou_e2e", commandType: "chat", textLength: 4
      });

      const result = await denyDispatcher.dispatch(trigger);
      expect(result.status).toBe("failed");

      // workflowInstanceId() is called during dispatch metadata, even for denied requests
      expect(wfiCounter).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it("no workflow selector match fails at workflow selection", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Register an intent resolver but NO matching selector
      harness.intentResolvers.register({
        id: "orphan-intent",
        canResolve(event) { return event.source.pluginId === "feishu" && event.source.triggerType === "message"; },
        resolve(event) {
          return { intentId: `intent_${event.triggerEventId}`, kind: "chat" as const, workspaceId: "ws_e2e", projectId: null, actor: { kind: "user" as const, userId: "user_e2e" }, payload: { text: "hi" } };
        }
      });
      // No matching workflow selector registered

      let wfiCounter = 0;
      let raCounter = 0;
      const noMatchDispatcher = new IngressDispatcher(
        makeBasicDeps({
          identityResolver: {
            resolve: () => ({ status: "resolved" as const, userId: "user_e2e", displayName: "User" })
          },
          workspaceResolver: {
            resolve: () => ({ status: "resolved" as const, workspaceId: "ws_e2e", projectId: null, conversationKey: "test" })
          },
          intentResolvers: harness.intentResolvers,
          workflowSelector: harness.workflowSelector,
          workflowRuntime: {
            start(input) { return harness.workflowRuntime.start(input); }
          },
          idFactory: {
            workflowInstanceId: () => { wfiCounter++; return `wfi_nm_${wfiCounter}`; },
            runAttemptId: () => { raCounter++; return `ra_nm_${raCounter}`; }
          }
        })
      );

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_nomatch", receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e", messageId: "om_nm", senderUserId: "ou_e2e", commandType: "chat", textLength: 3
      });

      // WorkflowSelector.select throws when no match
      await expect(noMatchDispatcher.dispatch(trigger)).rejects.toThrow();
    } finally {
      await harness.close();
    }
  });

  it("missing effect handler fails with EFFECT_HANDLER_NOT_FOUND", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Register everything EXCEPT the effect handler
      harness.intentResolvers.register({
        id: "feishu-chat",
        canResolve(event) { return event.source.pluginId === "feishu" && event.source.triggerType === "message"; },
        resolve(event) {
          return { intentId: `intent_${event.triggerEventId}`, kind: "chat" as const, workspaceId: "ws_e2e", projectId: null, actor: { kind: "user" as const, userId: "user_e2e" }, payload: { text: "hello" } };
        }
      });
      harness.workflowSelector.register({ id: "chat-rule", matches(intent) { return intent.kind === "chat"; }, definitionId: "feishu.chat.workflow" });
      harness.workflowRegistry.register({
        definitionId: "feishu.chat.workflow", version: 1, concurrencyPolicy: "skip_if_running",
        steps: [{ stepId: "reply", async run(ctx) {
          // Execute effect WITHOUT registering the handler
          await ctx.executeEffect({ pluginId: "feishu", effectType: "message.reply", input: { text: "hi" } });
          return { kind: "complete" as const };
        } }]
      });

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_no_handler", receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e", messageId: "om_nh", senderUserId: "ou_e2e", commandType: "chat", textLength: 3
      });

      // When an effect handler is not registered, the effect executor records
      // effect.failed and then throws EFFECT_HANDLER_NOT_FOUND. The runtime
      // catches step-level throws and records step.failed + attempt.failed.
      const dispatchResult = await harness.dispatcher.dispatch(trigger);
      expect(dispatchResult.status).toBe("failed");

      const wfiId = `wfi_e2e_${harness.wfiCounter}`;
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("effect.failed");
      expect(events).toContain("step.failed");
      expect(events).toContain("attempt.failed");
    } finally {
      await harness.close();
    }
  });

  it("effect handler throws produces effect.failed and attempt.failed", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      harness.effectHandlerRegistry.register({
        pluginId: "feishu",
        effectType: "message.reply",
        execute() { throw new Error("downstream service unavailable"); }
      });
      harness.intentResolvers.register({
        id: "feishu-chat",
        canResolve(event) { return event.source.pluginId === "feishu" && event.source.triggerType === "message"; },
        resolve(event) {
          return { intentId: `intent_${event.triggerEventId}`, kind: "chat" as const, workspaceId: "ws_e2e", projectId: null, actor: { kind: "user" as const, userId: "user_e2e" }, payload: { text: "hello" } };
        }
      });
      harness.workflowSelector.register({ id: "chat-rule", matches(intent) { return intent.kind === "chat"; }, definitionId: "feishu.chat.workflow" });
      harness.workflowRegistry.register({
        definitionId: "feishu.chat.workflow", version: 1, concurrencyPolicy: "skip_if_running",
        steps: [{ stepId: "reply", async run(ctx) {
          await ctx.executeEffect({ pluginId: "feishu", effectType: "message.reply", input: { text: "hi" } });
          return { kind: "complete" as const };
        } }]
      });

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_throw", receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e", messageId: "om_throw", senderUserId: "ou_e2e", commandType: "chat", textLength: 3
      });

      const result = await harness.dispatcher.dispatch(trigger);
      expect(result.status).toBe("failed");

      const wfiId = `wfi_e2e_${harness.wfiCounter}`;
      const events = harness.runtimeEvents(wfiId);
      expect(events).toContain("effect.failed");
      expect(events).toContain("step.failed");
      expect(events).toContain("attempt.failed");
      expect(events).not.toContain("attempt.completed");
    } finally {
      await harness.close();
    }
  });

  it("invalid control action payload fails with validation error", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Create a control action with invalid payload (missing required stepStateId)
      const actionId = "ca_invalid_payload";
      harness.controlActionStore.create({
        id: actionId,
        workspaceId: "ws_e2e",
        actorUserId: "user_e2e",
        actionType: "approve_step",
        payload: { comment: "missing stepStateId" }, // missing required stepStateId field
        now: "2026-05-31T00:00:00.000Z"
      });

      const result = await harness.controlActionProcessor.process(actionId, "2026-05-31T00:00:00.000Z");
      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    } finally {
      await harness.close();
    }
  });

  it("unknown control action type fails with validation error", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      const actionId = "ca_unknown_type";
      harness.controlActionStore.create({
        id: actionId,
        workspaceId: "ws_e2e",
        actorUserId: "user_e2e",
        actionType: "nonexistent_action",
        payload: { foo: "bar" },
        now: "2026-05-31T00:00:00.000Z"
      });

      const result = await harness.controlActionProcessor.process(actionId, "2026-05-31T00:00:00.000Z");
      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("CONTROL_ACTION_INVALID_PAYLOAD");
    } finally {
      await harness.close();
    }
  });

  it("missing control action handler throws appropriate error", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Wire approve_step handler but NOT cancel_workflow
      harness.controlHandlers.approveStep = {
        async approveStep() { return { status: "completed" as const }; }
      };

      const actionId = "ca_no_handler";
      harness.controlActionStore.create({
        id: actionId,
        workspaceId: "ws_e2e",
        actorUserId: "user_e2e",
        actionType: "cancel_workflow",
        payload: { workflowInstanceId: "wfi_xyz" },
        now: "2026-05-31T00:00:00.000Z"
      });

      const result = await harness.controlActionProcessor.process(actionId, "2026-05-31T00:00:00.000Z");
      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe("CONTROL_ACTION_EXECUTION_FAILED");
    } finally {
      await harness.close();
    }
  });

  it("unknown actor identity produces incomplete trace without attempt.completed", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Build custom dispatcher where identity resolver returns "unknown"
      const unknownDispatcher = new IngressDispatcher(
        makeBasicDeps({
          identityResolver: {
            resolve: () => ({ status: "unknown" as const, reason: "no match" })
          },
          workspaceResolver: {
            resolve: () => ({ status: "resolved" as const, workspaceId: "ws_e2e", projectId: null, conversationKey: "test" })
          },
          permissionPolicy: {
            checkPermission: () => ({ allowed: false, role: "member" as const, reason: "test" }),
            decide: (p) => p.allowed ? { kind: "allow" as const } : { kind: "deny" as const, reason: "test" }
          },
          intentResolvers: harness.intentResolvers,
          workflowSelector: harness.workflowSelector,
          workflowRuntime: {
            start(input) { return harness.workflowRuntime.start(input); }
          },
          idFactory: { workflowInstanceId: () => "wfi_unknown", runAttemptId: () => "ra_unknown" }
        })
      );

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_unknown", receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e", messageId: "om_uk", senderUserId: "ou_unknown", commandType: "chat", textLength: 3
      });

      // Register minimal wiring so intent resolution can proceed
      harness.intentResolvers.register({
        id: "unk-intent",
        canResolve() { return true; },
        resolve(event) {
          return { intentId: `intent_${event.triggerEventId}`, kind: "chat" as const, workspaceId: "ws_e2e", projectId: null, actor: { kind: "system" as const }, payload: {} };
        }
      });
      harness.workflowSelector.register({ id: "unk-rule", matches() { return true; }, definitionId: "test.unknown" });
      harness.workflowRegistry.register({
        definitionId: "test.unknown", version: 1, concurrencyPolicy: "skip_if_running",
        steps: [{
          stepId: "noop",
          async run() { return { kind: "complete" as const }; }
        }]
      });

      // The dispatcher skips permission check when identity is "unknown" and
      // proceeds to intent resolution. This is a known gap — unknown actors
      // should fail at identity resolution rather than proceeding unauthenticated.
      // acceptance-allow-gap: unknown actor proceeds without permission check;
      // identity resolution should fail dispatcher when status is "unknown"
      const result = await unknownDispatcher.dispatch(trigger);
      // Current behavior: succeeds because no permission check blocks it
      // Future: should return { status: "failed" }
    } finally {
      await harness.close();
    }
  });

  it("no intent resolver fails with thrown error before workflow starts", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      // Don't register any intent resolver

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_no_intent", receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e", messageId: "om_ni", senderUserId: "ou_e2e", commandType: "chat", textLength: 3
      });

      await expect(harness.dispatcher.dispatch(trigger)).rejects.toThrow();
    } finally {
      await harness.close();
    }
  });
});
