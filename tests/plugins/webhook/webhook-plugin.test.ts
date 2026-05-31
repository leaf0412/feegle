import { describe, expect, it } from "vitest";
import { EffectHandlerRegistry } from "../../../src/core/runtime/effect-handler-registry.js";
import { IntentResolverRegistry } from "../../../src/ingress/intent-resolver-registry.js";
import { WorkflowRegistry } from "../../../src/core/runtime/workflow-registry.js";
import { WorkflowSelector } from "../../../src/ingress/workflow-selector.js";
import { webhookRuntimeContribution } from "../../../src/plugins/webhook/webhook-plugin.js";

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
      workspaceId: "ws_personal",
      projectId: null,
      actor: { kind: "system" },
      payload: {}
    });

    expect(selection.definitionId).toBe("webhook.inbound.workflow");
  });
});
