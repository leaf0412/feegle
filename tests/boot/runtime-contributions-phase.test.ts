import { describe, expect, it } from "vitest";
import { BootContext } from "@infra/boot/boot-context.js";
import { runtimeContributionsPhase } from "@infra/boot/phases/runtime-contributions-phase.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import type { AgentConversationRunner } from "@core/agent-conversation/agent-conversation-service.js";

function fakeAgentConversationService(): AgentConversationRunner {
  return {
    async run() {
      return { status: "no_provider", reason: "test", progress: [] };
    }
  };
}

describe("RuntimeContributionContext", () => {
  it("groups runtime registries for plugin contribution registration", () => {
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry(),
      agentConversationService: fakeAgentConversationService()
    });

    expect(ctx.workflows).toBeInstanceOf(WorkflowRegistry);
    expect(ctx.intentResolvers).toBeInstanceOf(IntentResolverRegistry);
    expect(ctx.workflowSelector).toBeInstanceOf(WorkflowSelector);
    expect(ctx.effectHandlers).toBeInstanceOf(EffectHandlerRegistry);
    expect(ctx.agentConversationService).toBeDefined();
  });

  it("runs runtime contribution modules with runtime registries", async () => {
    const boot = new BootContext();
    boot.provide("workflowRegistry", new WorkflowRegistry());
    boot.provide("intentResolvers", new IntentResolverRegistry());
    boot.provide("workflowSelector", new WorkflowSelector());
    boot.provide("effectHandlers", new EffectHandlerRegistry());
    boot.provide("agentConversationService", fakeAgentConversationService());

    const phase = runtimeContributionsPhase({
      contributions: {
        handlerKinds: [],
        slashCommands: [],
        quoteClients: [],
        notificationAdapters: [],
        platformRuntimes: [],
        provisions: [],
        runtimeContributions: [
          {
            id: "test-runtime-contribution",
            register: (ctx) => {
              ctx.workflows.register({
                definitionId: "test.registered",
                version: 1,
                concurrencyPolicy: "reject_if_running",
                steps: [{ stepId: "done", run: () => ({ kind: "complete" }) }]
              });
            }
          }
        ]
      }
    });

    await phase.run(boot);

    expect(boot.require("workflowRegistry").require("test.registered").definitionId).toBe("test.registered");
  });
});
