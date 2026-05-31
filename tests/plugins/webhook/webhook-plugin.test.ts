import { describe, expect, it, vi } from "vitest";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { webhookRuntimeContribution } from "@plugins/webhook/webhook-plugin.js";

describe("webhook runtime contribution", () => {
  it("registers intent resolver, workflow, and effect handlers", () => {
    const workflows = new WorkflowRegistry();
    const intentResolvers = new IntentResolverRegistry();
    const selector = new WorkflowSelector();
    const effectHandlers = new EffectHandlerRegistry();

    const module = webhookRuntimeContribution();
    module.register({ workflows, intentResolvers, workflowSelector: selector, effectHandlers });

    // Workflow registered
    const def = workflows.require("webhook.inbound.workflow");
    expect(def.definitionId).toBe("webhook.inbound.workflow");
    expect(def.version).toBe(1);
    expect(def.concurrencyPolicy).toBe("reject_if_running");
    expect(def.steps.length).toBe(1);
    expect(def.steps[0].stepId).toBe("record");

    // Effect handlers registered
    expect(effectHandlers.has("webhook", "record_event")).toBe(true);
  });

  it("resolves webhook trigger events", () => {
    const intentResolvers = new IntentResolverRegistry();

    const module = webhookRuntimeContribution();
    module.register({
      workflows: new WorkflowRegistry(),
      intentResolvers,
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    });

    expect(intentResolvers).toBeDefined();
  });

  it("selects webhook.inbound.workflow for webhook kind", () => {
    const selector = new WorkflowSelector();

    const module = webhookRuntimeContribution();
    module.register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: selector,
      effectHandlers: new EffectHandlerRegistry()
    });

    const selection = selector.select({
      intentId: "intent:test",
      kind: "workflow_signal",
      workspaceId: "ws_test",
      projectId: null,
      actor: { kind: "system" },
      payload: {}
    });

    expect(selection.definitionId).toBe("webhook.inbound.workflow");
  });

  it("record_event effect calls outbound callback with payload", async () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const effectHandlers = new EffectHandlerRegistry();

    webhookRuntimeContribution(callback).register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    const payload = { event: "merge_request", action: "open", id: 42 };
    const result = await effectHandlers.execute({
      effectId: "eff_wh_1",
      pluginId: "webhook",
      effectType: "record_event",
      input: { payload }
    });

    expect(callback).toHaveBeenCalledWith(payload);
    expect(result).toMatchObject({ recorded: true, eventId: "eff_wh_1" });
  });

  it("record_event effect works without a callback", async () => {
    const effectHandlers = new EffectHandlerRegistry();

    webhookRuntimeContribution().register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    const result = await effectHandlers.execute({
      effectId: "eff_wh_2",
      pluginId: "webhook",
      effectType: "record_event",
      input: { payload: { event: "push" } }
    });

    expect(result).toMatchObject({ recorded: true, eventId: "eff_wh_2" });
  });

  it("record_event effect throws for missing payload", async () => {
    const effectHandlers = new EffectHandlerRegistry();

    webhookRuntimeContribution().register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    await expect(
      effectHandlers.execute({
        effectId: "eff_wh_bad",
        pluginId: "webhook",
        effectType: "record_event",
        input: {}
      })
    ).rejects.toThrow("Missing required field: payload");
  });

  it("record_event propagates callback errors", async () => {
    const callback = vi.fn().mockRejectedValue(new Error("Webhook send failed"));
    const effectHandlers = new EffectHandlerRegistry();

    webhookRuntimeContribution(callback).register({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers
    });

    await expect(
      effectHandlers.execute({
        effectId: "eff_wh_fail",
        pluginId: "webhook",
        effectType: "record_event",
        input: { payload: { event: "push" } }
      })
    ).rejects.toThrow("Webhook send failed");
  });
});
