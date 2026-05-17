import { describe, expect, it } from "vitest";
import { parseFeishuPlatformConfig } from "../../src/feishu/feishu-platform-config.js";

describe("parseFeishuPlatformConfig", () => {
  it("uses safe defaults for platform routing options", () => {
    expect(parseFeishuPlatformConfig({ appId: "cli", appSecret: "secret" })).toEqual({
      appId: "cli",
      appSecret: "secret",
      verificationToken: undefined,
      encryptKey: undefined,
      botOpenId: undefined,
      enableInteractiveCards: true,
      allowFrom: "*",
      allowChat: "*",
      groupOnly: false,
      groupReplyAll: false,
      shareSessionInChannel: false,
      threadIsolation: false,
      replyToTrigger: true,
      progressStyle: "legacy",
      reactionEmoji: "OnIt",
      doneEmoji: undefined
    });
  });

  it("rejects invalid progress style before runtime starts", () => {
    expect(() =>
      parseFeishuPlatformConfig({
        appId: "cli",
        appSecret: "secret",
        progressStyle: "fast"
      })
    ).toThrow("Invalid Feishu progress style");
  });
});
