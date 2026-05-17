import { describe, expect, it, vi } from "vitest";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import { addDoneReaction, startTyping } from "../../src/feishu/feishu-reactions.js";

describe("startTyping", () => {
  it("adds the typing reaction and returns a stop function that removes it", async () => {
    const addReaction = vi.fn().mockResolvedValue("reaction_1");
    const removeReaction = vi.fn().mockResolvedValue(undefined);
    const stop = await startTyping(fakeClient({ addReaction, removeReaction }), "om_1");
    expect(addReaction).toHaveBeenCalledWith("om_1", "OnIt");
    await stop();
    expect(removeReaction).toHaveBeenCalledWith("om_1", "reaction_1");
  });

  it("returns a no-op stop function when the platform refuses the reaction", async () => {
    const addReaction = vi.fn().mockResolvedValue(undefined);
    const removeReaction = vi.fn();
    const stop = await startTyping(fakeClient({ addReaction, removeReaction }), "om_1");
    await stop();
    expect(removeReaction).not.toHaveBeenCalled();
  });

  it("skips entirely when emojiType is the empty string", async () => {
    const addReaction = vi.fn();
    const stop = await startTyping(fakeClient({ addReaction }), "om_1", { emojiType: "" });
    expect(addReaction).not.toHaveBeenCalled();
    await stop();
  });
});

describe("addDoneReaction", () => {
  it("adds the configured done emoji", async () => {
    const addReaction = vi.fn().mockResolvedValue("reaction_done");
    await addDoneReaction(fakeClient({ addReaction }), "om_1", "DoneTag");
    expect(addReaction).toHaveBeenCalledWith("om_1", "DoneTag");
  });

  it("is a no-op when the done emoji is not configured", async () => {
    const addReaction = vi.fn();
    await addDoneReaction(fakeClient({ addReaction }), "om_1", undefined);
    expect(addReaction).not.toHaveBeenCalled();
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
