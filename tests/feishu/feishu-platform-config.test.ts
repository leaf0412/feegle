import { describe, expect, it } from "vitest";
import { parseFeishuPlatformConfig, type FeishuPlatformConfigInput } from "../../src/feishu/feishu-platform-config.js";

function input(overrides: Partial<FeishuPlatformConfigInput> = {}): FeishuPlatformConfigInput {
  return {
    appId: "cli", appSecret: "sec",
    enableInteractiveCards: true, allowFrom: "*", allowChat: "*",
    groupOnly: false, groupReplyAll: false, shareSessionInChannel: false,
    threadIsolation: false, replyToTrigger: true, progressStyle: "card",
    reactionEmoji: "OnIt",
    ...overrides
  };
}

describe("parseFeishuPlatformConfig", () => {
  it("passes typed values through unchanged (config.jsonc is the source; no code defaults)", () => {
    const out = parseFeishuPlatformConfig(input({ allowFrom: "ou_a", groupOnly: true }));
    expect(out.allowFrom).toBe("ou_a");
    expect(out.groupOnly).toBe(true);
    expect(out.progressStyle).toBe("card");
  });

  it("treats reactionEmoji \"none\" as disabled (undefined) so operators can turn reactions off", () => {
    expect(parseFeishuPlatformConfig(input({ reactionEmoji: "none" })).reactionEmoji).toBeUndefined();
  });

  it("treats doneEmoji \"none\" as disabled (undefined)", () => {
    expect(parseFeishuPlatformConfig(input({ doneEmoji: "none" })).doneEmoji).toBeUndefined();
  });
});
