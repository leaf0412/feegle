import { describe, expect, it } from "vitest";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { gitlabRuntimeContribution } from "@plugins/gitlab-follow/gitlab-runtime-contribution.js";

describe("gitlab runtime contribution", () => {
  it("registers intent resolver, workflow, and effect handlers", () => {
    const workflows = new WorkflowRegistry();
    const intentResolvers = new IntentResolverRegistry();
    const selector = new WorkflowSelector();
    const effectHandlers = new EffectHandlerRegistry();

    const module = gitlabRuntimeContribution();
    module.register({ workflows, intentResolvers, workflowSelector: selector, effectHandlers });

    // Workflow registered
    const def = workflows.require("gitlab.review.workflow");
    expect(def.definitionId).toBe("gitlab.review.workflow");

    // Effect handlers registered
    expect(effectHandlers.has("gitlab", "post_comment")).toBe(true);
    expect(effectHandlers.has("gitlab", "update_status")).toBe(true);
  });
});
