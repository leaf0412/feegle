import { describe, expect, it } from "vitest";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { requirementWorkflowRuntimeContribution } from "@plugins/requirement-workflow/requirement-workflow-runtime-contribution.js";

describe("requirement planning workflows", () => {
  it("selects generate and revise workflows from platform-neutral intents", () => {
    const selector = new WorkflowSelector();
    const workflows = new WorkflowRegistry();
    requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: selector,
      effectHandlers: new EffectHandlerRegistry()
    }));

    expect(selector.select({
      intentId: "intent_1",
      kind: "requirement_plan_generate",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1" }
    }).definitionId).toBe("requirement.plan.generate.workflow");

    expect(selector.select({
      intentId: "intent_2",
      kind: "requirement_plan_revise",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1", feedback: "add tests" }
    }).definitionId).toBe("requirement.plan.revise.workflow");

    // workflow definitions must be registered too
    expect(() => workflows.require("requirement.plan.generate.workflow")).not.toThrow();
    expect(() => workflows.require("requirement.plan.revise.workflow")).not.toThrow();
  });
});
