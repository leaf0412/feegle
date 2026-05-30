import { describe, expect, it } from "vitest";
import { IntentResolverRegistry } from "../../src/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "../../src/ingress/workflow-selector.js";
import { EffectHandlerRegistry } from "../../src/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "../../src/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "../../src/runtime/workflow-registry.js";

describe("RuntimeContributionContext", () => {
  it("groups runtime registries for plugin contribution registration", () => {
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    });

    expect(ctx.workflows).toBeInstanceOf(WorkflowRegistry);
    expect(ctx.intentResolvers).toBeInstanceOf(IntentResolverRegistry);
    expect(ctx.workflowSelector).toBeInstanceOf(WorkflowSelector);
    expect(ctx.effectHandlers).toBeInstanceOf(EffectHandlerRegistry);
  });
});
