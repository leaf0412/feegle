import { describe, expect, it, vi } from "vitest";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { feishuRuntimeContribution } from "@plugins/feishu/feishu-runtime-contribution.js";
import { gitlabRuntimeContribution } from "@plugins/gitlab-follow/gitlab-runtime-contribution.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import type { GitLabClient } from "@integrations/gitlab/gitlab-client.js";

function createMockClient(): FeishuClientPort {
  return {
    replyText: vi.fn().mockResolvedValue("reply_msg_1"),
    sendText: vi.fn().mockResolvedValue("msg_1"),
    sendInteractiveCard: vi.fn().mockResolvedValue("card_msg_1"),
    sendFile: vi.fn().mockResolvedValue("file_msg_1"),
    replyInteractiveCard: vi.fn().mockResolvedValue("reply_card_msg_1"),
    updateInteractiveCard: vi.fn().mockResolvedValue(undefined),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    addReaction: vi.fn().mockResolvedValue("reaction_1"),
    removeReaction: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    fetchBotOpenId: vi.fn().mockResolvedValue("bot_1"),
    fetchUserName: vi.fn().mockResolvedValue("User"),
    fetchUserEmail: vi.fn().mockResolvedValue("user@test.com"),
    fetchChatName: vi.fn().mockResolvedValue("Chat"),
    fetchChatMembers: vi.fn().mockResolvedValue([]),
    fetchMessage: vi.fn().mockResolvedValue(undefined),
    fetchMergeForwardItems: vi.fn().mockResolvedValue([]),
    sendImage: vi.fn().mockResolvedValue("img_msg_1"),
    sendAudio: vi.fn().mockResolvedValue("audio_msg_1"),
    downloadResource: vi.fn().mockResolvedValue(Buffer.from("test")),
    downloadImage: vi.fn().mockResolvedValue({ data: Buffer.from("test"), mimeType: "image/png" })
  };
}

describe("feishuRuntimeContribution", () => {
  it("registers Feishu chat selector, resolver, and platform effects", async () => {
    const mockClient = createMockClient();
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    });

    await feishuRuntimeContribution(mockClient).register(ctx);

    const intent = await ctx.intentResolvers.resolve({
      triggerEventId: "trg_1",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-31T00:00:00.000Z",
      external: { chatId: "oc_1", messageId: "om_1", resolvedWorkspaceId: "ws_test", resolvedProjectId: "project_test", commandType: "chat" },
      actorHint: { provider: "feishu", externalUserId: "ou_1" },
      conversationHint: { conversationKey: "feishu:oc_1" },
      payloadSummary: { commandType: "chat", textLength: 5 }
    });

    expect(intent.kind).toBe("chat");
    expect(intent.workspaceId).toBe("ws_test");
    expect(intent.projectId).toBe("project_test");
    expect(ctx.workflowSelector.select(intent).definitionId).toBe("agent.conversation.workflow");
  });

  it("keeps Feishu chat selection isolated when GitLab runtime is also registered", async () => {
    const mockClient = createMockClient();
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: new EffectHandlerRegistry()
    });

    gitlabRuntimeContribution(() => ({} as GitLabClient)).register(ctx);
    await feishuRuntimeContribution(mockClient).register(ctx);

    const intent = await ctx.intentResolvers.resolve({
      triggerEventId: "trg_feishu",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "2026-05-31T00:00:00.000Z",
      external: {
        chatId: "oc_1",
        messageId: "om_1",
        raw: "hello",
        resolvedWorkspaceId: "ws_test",
        resolvedProjectId: "project_test",
        commandType: "chat"
      },
      actorHint: { provider: "feishu", externalUserId: "ou_1" },
      conversationHint: { conversationKey: "feishu:oc_1" },
      payloadSummary: { commandType: "chat", textLength: 5 }
    });

    expect(ctx.workflowSelector.select(intent).definitionId).toBe("agent.conversation.workflow");
  });

  it("feishu reply effect calls client.replyText with correct args", async () => {
    const mockClient = createMockClient();
    const handlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: handlers
    });

    await feishuRuntimeContribution(mockClient).register(ctx);

    const result = await handlers.execute({
      effectId: "eff_reply_1",
      pluginId: "feishu",
      effectType: "reply",
      input: { messageId: "om_42", content: "Hello world" }
    });

    expect(mockClient.replyText).toHaveBeenCalledWith("om_42", "Hello world");
    expect(result).toMatchObject({ replied: true, originalMessageId: "om_42" });
  });

  it("feishu reply effect throws for missing messageId", async () => {
    const mockClient = createMockClient();
    const handlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: handlers
    });

    await feishuRuntimeContribution(mockClient).register(ctx);

    await expect(
      handlers.execute({
        effectId: "eff_reply_bad",
        pluginId: "feishu",
        effectType: "reply",
        input: { content: "missing messageId" }
      })
    ).rejects.toThrow("Missing required field: messageId");
  });

  it("feishu reply effect throws for missing content", async () => {
    const mockClient = createMockClient();
    const handlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: handlers
    });

    await feishuRuntimeContribution(mockClient).register(ctx);

    await expect(
      handlers.execute({
        effectId: "eff_reply_no_content",
        pluginId: "feishu",
        effectType: "reply",
        input: { messageId: "om_42" }
      })
    ).rejects.toThrow("Missing required field: content");
  });

  it("feishu card.update effect calls client.updateInteractiveCard with correct args", async () => {
    const mockClient = createMockClient();
    const handlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: handlers
    });

    await feishuRuntimeContribution(mockClient).register(ctx);

    const cardData = { elements: [{ tag: "markdown", content: "Updated card" }] };
    const result = await handlers.execute({
      effectId: "eff_card_1",
      pluginId: "feishu",
      effectType: "card.update",
      input: { messageId: "om_99", card: cardData }
    });

    expect(mockClient.updateInteractiveCard).toHaveBeenCalledWith("om_99", cardData);
    expect(result).toMatchObject({ updated: true, messageId: "om_99" });
  });

  it("feishu card.update effect throws for missing card field", async () => {
    const mockClient = createMockClient();
    const handlers = new EffectHandlerRegistry();
    const ctx = new RuntimeContributionContext({
      workflows: new WorkflowRegistry(),
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: new WorkflowSelector(),
      effectHandlers: handlers
    });

    await feishuRuntimeContribution(mockClient).register(ctx);

    await expect(
      handlers.execute({
        effectId: "eff_card_bad",
        pluginId: "feishu",
        effectType: "card.update",
        input: { messageId: "om_99" }
      })
    ).rejects.toThrow("Missing required field: card");
  });
});
