import { describe, expect, it } from "vitest";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { requirementWorkflowRuntimeContribution } from "@plugins/requirement-workflow/requirement-workflow-runtime-contribution.js";

describe("requirement cancel workflow", () => {
  it("routes requirement_cancel and registers the cancel workflow", () => {
    const selector = new WorkflowSelector();
    const workflows = new WorkflowRegistry();
    requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
      workflows, intentResolvers: new IntentResolverRegistry(), workflowSelector: selector, effectHandlers: new EffectHandlerRegistry()
    }));
    expect(selector.select({
      intentId: "i", kind: "requirement_cancel", workspaceId: "ws", projectId: null,
      actor: { kind: "user", userId: "u" }, payload: { requirementId: "reqwf_1" }
    }).definitionId).toBe("requirement.cancel.workflow");
    expect(() => workflows.require("requirement.cancel.workflow")).not.toThrow();
  });
});

describe("requirement verification workflow selectors", () => {
  it("routes verify and accept intents", () => {
    const selector = new WorkflowSelector();
    requirementWorkflowRuntimeContribution().register({
      workflowSelector: selector,
      workflows: { register: () => undefined },
      intentResolvers: { register: () => undefined },
      effectHandlers: { register: () => undefined }
    } as never);

    expect(selector.select({
      intentId: "intent_verify",
      kind: "requirement_verify",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1" }
    }).definitionId).toBe("requirement.verify.workflow");

    expect(selector.select({
      intentId: "intent_accept",
      kind: "requirement_accept",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1" }
    }).definitionId).toBe("requirement.accept.workflow");
  });

  it("registers the verify and accept workflow definitions", () => {
    const workflows = new WorkflowRegistry();
    requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    }));
    expect(() => workflows.require("requirement.verify.workflow")).not.toThrow();
    expect(() => workflows.require("requirement.accept.workflow")).not.toThrow();
  });
});
