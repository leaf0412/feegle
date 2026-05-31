import { describe, expect, it } from "vitest";
import { IntentResolverRegistry } from "../../../src/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "../../../src/ingress/workflow-selector.js";
import { feishuRuntimeContribution } from "@plugins/feishu/feishu-runtime-contribution.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";

describe("feishuRuntimeContribution", () => {
  it("registers Feishu chat workflow, selector, resolver, and reply effect", async () => {
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    });

    await feishuRuntimeContribution({ workspaceId: "ws_default" }).register(ctx);

    expect(ctx.workflows.require("feishu.chat.workflow").definitionId).toBe("feishu.chat.workflow");
    const intent = await ctx.intentResolvers.resolve({
      triggerEventId: "trg_1",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-31T00:00:00.000Z",
      external: { chatId: "oc_1", messageId: "om_1" },
      actorHint: { provider: "feishu", externalUserId: "ou_1" },
      conversationHint: { conversationKey: "feishu:oc_1" },
      payloadSummary: { commandType: "chat", textLength: 5 }
    });

    expect(intent.kind).toBe("chat");
    expect(ctx.workflowSelector.select(intent).definitionId).toBe("feishu.chat.workflow");
  });
});
