import { describe, expect, it, vi } from "vitest";
import { addDoneReaction, startTyping } from "../../src/feishu/feishu-reactions.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";

describe("startTyping", () => {
  it("adds the typing reaction and returns a stop function that removes it", async () => {
    const addReaction = vi.fn().mockResolvedValue("reaction_1");
    const removeReaction = vi.fn().mockResolvedValue(undefined);
    const stop = await startTyping(makeFakeFeishuClient({ addReaction, removeReaction }), "om_1");
    expect(addReaction).toHaveBeenCalledWith("om_1", "OnIt");
    await stop();
    expect(removeReaction).toHaveBeenCalledWith("om_1", "reaction_1");
  });

  it("returns a no-op stop function when the platform refuses the reaction", async () => {
    const addReaction = vi.fn().mockResolvedValue(undefined);
    const removeReaction = vi.fn();
    const stop = await startTyping(makeFakeFeishuClient({ addReaction, removeReaction }), "om_1");
    await stop();
    expect(removeReaction).not.toHaveBeenCalled();
  });

  it("skips entirely when emojiType is the empty string", async () => {
    const addReaction = vi.fn();
    const stop = await startTyping(makeFakeFeishuClient({ addReaction }), "om_1", { emojiType: "" });
    expect(addReaction).not.toHaveBeenCalled();
    await stop();
  });
});

describe("addDoneReaction", () => {
  it("adds the configured done emoji", async () => {
    const addReaction = vi.fn().mockResolvedValue("reaction_done");
    await addDoneReaction(makeFakeFeishuClient({ addReaction }), "om_1", "DoneTag");
    expect(addReaction).toHaveBeenCalledWith("om_1", "DoneTag");
  });

  it("is a no-op when the done emoji is not configured", async () => {
    const addReaction = vi.fn();
    await addDoneReaction(makeFakeFeishuClient({ addReaction }), "om_1", undefined);
    expect(addReaction).not.toHaveBeenCalled();
  });
});
