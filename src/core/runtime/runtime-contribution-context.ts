import type { AgentConversationRunner } from "@core/agent-conversation/agent-conversation-service.js";
import type { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import type { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import type { EffectHandlerRegistry } from "./effect-handler-registry.js";
import type { WorkflowRegistry } from "./workflow-registry.js";

export class RuntimeContributionContext {
  readonly workflows: WorkflowRegistry;
  readonly intentResolvers: IntentResolverRegistry;
  readonly workflowSelector: WorkflowSelector;
  readonly effectHandlers: EffectHandlerRegistry;
  readonly agentConversationService?: AgentConversationRunner;

  constructor(input: {
    workflows: WorkflowRegistry;
    intentResolvers: IntentResolverRegistry;
    workflowSelector: WorkflowSelector;
    effectHandlers: EffectHandlerRegistry;
    agentConversationService?: AgentConversationRunner;
  }) {
    this.workflows = input.workflows;
    this.intentResolvers = input.intentResolvers;
    this.workflowSelector = input.workflowSelector;
    this.effectHandlers = input.effectHandlers;
    this.agentConversationService = input.agentConversationService;
  }
}
