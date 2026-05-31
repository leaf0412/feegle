import { describe, expect, it, vi } from "vitest";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { agentConversationRuntimeContribution } from "@core/agent-conversation/agent-conversation-runtime-contribution.js";
import type { AgentConversationRunner } from "@core/agent-conversation/agent-conversation-service.js";

describe("agentConversationRuntimeContribution", () => {
  it("runs the platform-neutral agent service and renders through the source plugin effect", async () => {
    const run = vi.fn().mockResolvedValue({
      status: "delivered",
      provider: "Mock Agent",
      answer: "agent generated answer",
      messages: [{ role: "user", content: "hello" }],
      progress: []
    });
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry(),
      agentConversationService: { run } as AgentConversationRunner
    });

    await agentConversationRuntimeContribution().register(ctx);
    const workflow = ctx.workflows.require("agent.conversation.workflow");
    const executeEffect = vi.fn().mockResolvedValue({ rendered: true });

    const result = await workflow.steps[0].run({
      input: {
        sourcePlugin: "feishu",
        resolvedWorkspaceId: "default",
        resolvedProjectId: null,
        resolvedUserId: "user_1",
        conversationKey: "feishu:oc_1",
        sessionKey: "feishu:oc_1:user_1",
        chatId: "oc_1",
        messageId: "om_1",
        text: "hello",
        shouldRespond: true
      },
      executeEffect,
      now: "2026-05-31T00:00:00.000Z"
    } as never);

    expect(run).toHaveBeenCalledWith({
      workspaceId: "default",
      projectId: null,
      conversationKey: "feishu:oc_1",
      sessionKey: "feishu:oc_1:user_1",
      userId: "user_1",
      userText: "hello",
      source: { pluginId: "feishu", chatId: "oc_1", messageId: "om_1" }
    });
    expect(executeEffect).toHaveBeenCalledWith({
      pluginId: "feishu",
      effectType: "agent_conversation.render",
      input: {
        chatId: "oc_1",
        messageId: "om_1",
        result: expect.objectContaining({ status: "delivered" })
      }
    });
    expect(result).toEqual({
      kind: "complete",
      output: expect.objectContaining({ status: "delivered" })
    });
  });
});
