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
