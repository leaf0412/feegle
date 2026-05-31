import { describe, expect, it, vi } from "vitest";
import { renderFeishuAgentConversationResult } from "@plugins/feishu/feishu-agent-conversation-renderer.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";

function createClient(): FeishuClientPort {
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

describe("renderFeishuAgentConversationResult", () => {
  it("renders delivered agent results as a Feishu final card reply", async () => {
    const client = createClient();

    await renderFeishuAgentConversationResult(client, {
      messageId: "om_1",
      chatId: "oc_1",
      result: {
        status: "delivered",
        provider: "Mock Agent",
        answer: "agent answer",
        messages: [{ role: "user", content: "hello" }],
        progress: []
      }
    });

    expect(client.replyInteractiveCard).toHaveBeenCalledWith(
      "om_1",
      expect.objectContaining({ schema: "2.0", config: expect.any(Object) })
    );
    expect(client.replyText).not.toHaveBeenCalledWith("om_1", "hello");
  });

  it("renders no-provider as an explicit Feishu text reply", async () => {
    const client = createClient();

    await renderFeishuAgentConversationResult(client, {
      messageId: "om_1",
      chatId: "oc_1",
      result: { status: "no_provider", reason: "no agent provider registered", progress: [] }
    });

    expect(client.replyText).toHaveBeenCalledWith(
      "om_1",
      expect.stringContaining("尚未注册任何 agent provider")
    );
  });
});
