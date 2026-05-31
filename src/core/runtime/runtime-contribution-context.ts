import type { IntentResolverRegistry } from "../../ingress/intent-resolver-registry.js";
import type { WorkflowSelector } from "../../ingress/workflow-selector.js";
import type { EffectHandlerRegistry } from "./effect-handler-registry.js";
import type { WorkflowRegistry } from "./workflow-registry.js";

export class RuntimeContributionContext {
  readonly workflows: WorkflowRegistry;
  readonly intentResolvers: IntentResolverRegistry;
  readonly workflowSelector: WorkflowSelector;
  readonly effectHandlers: EffectHandlerRegistry;

  constructor(input: {
    workflows: WorkflowRegistry;
    intentResolvers: IntentResolverRegistry;
    workflowSelector: WorkflowSelector;
    effectHandlers: EffectHandlerRegistry;
  }) {
    this.workflows = input.workflows;
    this.intentResolvers = input.intentResolvers;
    this.workflowSelector = input.workflowSelector;
    this.effectHandlers = input.effectHandlers;
  }
}
