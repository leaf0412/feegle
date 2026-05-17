import { describe, expect, it } from "vitest";
import { createPlatformSessionKey } from "../../src/platform/platform-session.js";

describe("createPlatformSessionKey", () => {
  it("uses user scope for direct messages", () => {
    expect(
      createPlatformSessionKey({
        platform: "feishu",
        chatId: "ou_user",
        userId: "ou_user",
        chatType: "p2p"
      })
    ).toBe("feishu:ou_user:ou_user");
  });

  it("can share a group session by chat", () => {
    expect(
      createPlatformSessionKey({
        platform: "feishu",
        chatId: "oc_group",
        userId: "ou_user",
        chatType: "group",
        shareSessionInChannel: true
      })
    ).toBe("feishu:oc_group:channel");
  });

  it("can isolate a group session by thread root", () => {
    expect(
      createPlatformSessionKey({
        platform: "feishu",
        chatId: "oc_group",
        userId: "ou_user",
        chatType: "group",
        threadIsolation: true,
        rootMessageId: "om_root"
      })
    ).toBe("feishu:oc_group:root:om_root");
  });
});
