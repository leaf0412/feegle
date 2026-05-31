import { describe, expect, it } from "vitest";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { requirementWorkflowRuntimeContribution } from "@plugins/requirement-workflow/requirement-workflow-runtime-contribution.js";

describe("requirement execution workflow selectors", () => {
  it("routes approval and execute intents to requirement workflows", () => {
    const selector = new WorkflowSelector();
    requirementWorkflowRuntimeContribution().register({
      workflowSelector: selector,
      workflows: { register: () => undefined },
      intentResolvers: { register: () => undefined },
      effectHandlers: { register: () => undefined }
    } as never);

    expect(selector.select({
      intentId: "intent_approve",
      kind: "requirement_plan_approve",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1", planVersion: 1 }
    }).definitionId).toBe("requirement.plan.approve.workflow");

    expect(selector.select({
      intentId: "intent_execute",
      kind: "requirement_execute",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1" }
    }).definitionId).toBe("requirement.execute.workflow");
  });

  it("registers the approve and execute workflow definitions", () => {
    const workflows = new WorkflowRegistry();
    requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    }));
    expect(() => workflows.require("requirement.plan.approve.workflow")).not.toThrow();
    expect(() => workflows.require("requirement.execute.workflow")).not.toThrow();
  });
});

describe("requirement.plan.approve.workflow step", () => {
  it("calls execution.approve effect then renders plan_approved via sourcePlugin when present", async () => {
    const workflows = new WorkflowRegistry();
    requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    }));

    const approveOutput = { approved: true, planVersion: 3 };
    const executedEffects: Array<{ pluginId: string; effectType: string; input: unknown }> = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", planVersion: 3, sourcePlugin: "feishu", chatId: "oc_1" },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executedEffects.push(e);
        if (e.effectType === "execution.approve") return approveOutput;
        return {};
      }
    };

    const definition = workflows.require("requirement.plan.approve.workflow");
    const step = definition.steps[0];
    const result = await step.run(stepCtx as never);

    expect(result).toEqual({ kind: "complete", output: approveOutput });
    expect(executedEffects[0]).toMatchObject({ pluginId: "requirement-workflow", effectType: "execution.approve" });
    expect(executedEffects[1]).toMatchObject({
      pluginId: "feishu",
      effectType: "requirement.plan_approved.render"
    });
  });

  it("skips plan_approved render when sourcePlugin is absent", async () => {
    const workflows = new WorkflowRegistry();
    requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    }));

    const executedEffects: Array<{ pluginId: string; effectType: string }> = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", planVersion: 1 },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executedEffects.push(e);
        return {};
      }
    };

    const definition = workflows.require("requirement.plan.approve.workflow");
    await definition.steps[0].run(stepCtx as never);

    expect(executedEffects).toHaveLength(1);
    expect(executedEffects[0].effectType).toBe("execution.approve");
  });
});
