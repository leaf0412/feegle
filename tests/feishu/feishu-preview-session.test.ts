import { describe, expect, it, vi } from "vitest";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import { FeishuPreviewSession } from "../../src/feishu/feishu-preview-session.js";

describe("FeishuPreviewSession", () => {
  it("starts a card via sendInteractiveCard and remembers the message id", async () => {
    const sendInteractiveCard = vi.fn().mockResolvedValue("om_preview");
    const session = new FeishuPreviewSession(fakeClient({ sendInteractiveCard }), "oc_1");
    await expect(session.start("hello")).resolves.toBe("om_preview");
    expect(session.currentMessageId).toBe("om_preview");
    expect(sendInteractiveCard).toHaveBeenCalledOnce();
  });

  it("can start via replyInteractiveCard when replyToMessageId is provided", async () => {
    const replyInteractiveCard = vi.fn().mockResolvedValue("om_preview");
    const session = new FeishuPreviewSession(fakeClient({ replyInteractiveCard }), "oc_1");
    await session.start("hello", { replyToMessageId: "om_trigger" });
    expect(replyInteractiveCard).toHaveBeenCalledWith("om_trigger", expect.any(Object));
  });

  it("rejects update() before start()", async () => {
    const session = new FeishuPreviewSession(fakeClient({}), "oc_1");
    await expect(session.update("x")).rejects.toThrow(/not started/);
  });

  it("update() patches the card via updateInteractiveCard", async () => {
    const updateInteractiveCard = vi.fn().mockResolvedValue(undefined);
    const session = new FeishuPreviewSession(
      fakeClient({ sendInteractiveCard: async () => "om_1", updateInteractiveCard }),
      "oc_1"
    );
    await session.start("init");
    await session.update("more");
    expect(updateInteractiveCard).toHaveBeenCalledWith("om_1", expect.any(Object));
  });

  it("setStatus rebuilds the card with a status-colored header", async () => {
    const updateInteractiveCard = vi.fn().mockResolvedValue(undefined);
    const session = new FeishuPreviewSession(
      fakeClient({ sendInteractiveCard: async () => "om_1", updateInteractiveCard }),
      "oc_1"
    );
    await session.start("init");
    await session.setStatus("done", "complete");
    const [, card] = updateInteractiveCard.mock.calls[0];
    expect((card as { header: { template: string } }).header.template).toBe("green");
    expect(session.status).toBe("done");
  });

  it("finish without final content deletes the preview by default", async () => {
    const deleteMessage = vi.fn().mockResolvedValue(undefined);
    const session = new FeishuPreviewSession(
      fakeClient({ sendInteractiveCard: async () => "om_1", deleteMessage }),
      "oc_1"
    );
    await session.start("init");
    await session.finish();
    expect(deleteMessage).toHaveBeenCalledWith("om_1");
    expect(session.currentMessageId).toBeUndefined();
  });

  it("finish keeps the preview when keepOnFinish=true and applies the final content", async () => {
    const updateInteractiveCard = vi.fn().mockResolvedValue(undefined);
    const deleteMessage = vi.fn();
    const session = new FeishuPreviewSession(
      fakeClient({ sendInteractiveCard: async () => "om_1", updateInteractiveCard, deleteMessage }),
      "oc_1"
    );
    await session.start("init");
    await session.finish({ keepOnFinish: true, finalContent: "done" });
    expect(updateInteractiveCard).toHaveBeenCalledWith("om_1", expect.any(Object));
    expect(deleteMessage).not.toHaveBeenCalled();
  });
});

function fakeClient(overrides: Partial<FeishuClientPort>): FeishuClientPort {
  const fallback = async () => undefined;
  return {
    sendText: fallback,
    sendInteractiveCard: fallback,
    sendFile: fallback,
    replyText: fallback,
    replyInteractiveCard: fallback,
    updateInteractiveCard: async () => {},
    updateProgress: async () => {},
    addReaction: fallback,
    removeReaction: async () => {},
    deleteMessage: async () => {},
    fetchBotOpenId: fallback,
    fetchUserName: fallback,
    fetchChatName: fallback,
    fetchChatMembers: async () => [],
    fetchMessage: fallback,
    fetchMergeForwardItems: async () => [],
    sendImage: fallback,
    sendAudio: fallback,
    downloadResource: fallback,
    downloadImage: fallback,
    ...overrides
  };
}
