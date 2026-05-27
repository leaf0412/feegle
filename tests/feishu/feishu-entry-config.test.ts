import { describe, expect, it } from "vitest";
import { buildFeishuEntryConfig, resolveFeishuEntryConfig } from "../../src/feishu/feishu-entry-config.js";
import type { FeishuPlatformConfigInput } from "../../src/feishu/feishu-platform-config.js";

function fullInput(overrides: Partial<FeishuPlatformConfigInput> = {}): FeishuPlatformConfigInput {
  return {
    appId: "cli_xxx", appSecret: "****",
    enableInteractiveCards: true, allowFrom: "*", allowChat: "*",
    groupOnly: false, groupReplyAll: false, shareSessionInChannel: false,
    threadIsolation: false, replyToTrigger: true, progressStyle: "card",
    reactionEmoji: "OnIt",
    ...overrides
  };
}

describe("buildFeishuEntryConfig", () => {
  it("does not require botOpenId because the entrypoint resolves it from app credentials", () => {
    expect(buildFeishuEntryConfig(fullInput()).botOpenId).toBeUndefined();
  });

  it("resolves the bot open id from Feishu when no override is configured", async () => {
    const calls: string[] = [];
    const config = await resolveFeishuEntryConfig(fullInput(), {
      fetchBotOpenId: async () => { calls.push("fetch"); return "ou_bot"; }
    });
    expect(config.botOpenId).toBe("ou_bot");
    expect(calls).toEqual(["fetch"]);
  });

  it("keeps an explicit bot open id override", async () => {
    const config = await resolveFeishuEntryConfig(fullInput({ botOpenId: "ou_override" }), {
      fetchBotOpenId: async () => { throw new Error("fetch should not be called"); }
    });
    expect(config.botOpenId).toBe("ou_override");
  });
});
