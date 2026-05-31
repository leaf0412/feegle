import { describe, expect, it } from "vitest";
import {
  createPlatformSessionKey,
  isThreadSessionKey,
  parseThreadRootID,
  reconstructPlatformReplyCtx,
  sessionKeyFromCardAction
} from "@platform/platform-session.js";

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

describe("parseThreadRootID", () => {
  it("extracts the root id from root: or thread: prefixes", () => {
    expect(parseThreadRootID("root:om_root")).toBe("om_root");
    expect(parseThreadRootID("thread:om_root")).toBe("om_root");
  });

  it("returns undefined for non-thread tails or empty roots", () => {
    expect(parseThreadRootID("channel")).toBeUndefined();
    expect(parseThreadRootID("root:")).toBeUndefined();
    expect(parseThreadRootID("ou_user")).toBeUndefined();
  });
});

describe("isThreadSessionKey", () => {
  it("recognises a thread-scoped session key", () => {
    expect(isThreadSessionKey("feishu:oc_group:root:om_root")).toBe(true);
  });

  it("rejects user / channel scoped keys", () => {
    expect(isThreadSessionKey("feishu:oc_group:channel")).toBe(false);
    expect(isThreadSessionKey("feishu:oc_group:ou_user")).toBe(false);
  });
});

describe("reconstructPlatformReplyCtx", () => {
  it("recovers a thread reply context including root message id", () => {
    expect(reconstructPlatformReplyCtx("feishu:oc_group:root:om_root", "feishu")).toEqual({
      platform: "feishu",
      chatId: "oc_group",
      rootMessageId: "om_root",
      shared: false,
      sessionKey: "feishu:oc_group:root:om_root"
    });
  });

  it("flags a shared channel session", () => {
    expect(reconstructPlatformReplyCtx("feishu:oc_group:channel", "feishu")).toEqual({
      platform: "feishu",
      chatId: "oc_group",
      shared: true,
      sessionKey: "feishu:oc_group:channel"
    });
  });

  it("throws on mismatched platform or missing chat id", () => {
    expect(() => reconstructPlatformReplyCtx("lark:oc_group:ou_user", "feishu")).toThrow(/invalid session key/);
    expect(() => reconstructPlatformReplyCtx("feishu:", "feishu")).toThrow(/invalid session key/);
  });
});

describe("sessionKeyFromCardAction", () => {
  it("prefers the session_key embedded in the card value when present", () => {
    expect(
      sessionKeyFromCardAction(
        { platform: "feishu", chatId: "oc_group", userId: "ou_user" },
        { session_key: "feishu:oc_group:root:om_root" }
      )
    ).toBe("feishu:oc_group:root:om_root");
  });

  it("falls back to user or channel scope when no key is embedded", () => {
    expect(
      sessionKeyFromCardAction({ platform: "feishu", chatId: "oc_group", userId: "ou_user" }, null)
    ).toBe("feishu:oc_group:ou_user");
    expect(
      sessionKeyFromCardAction(
        { platform: "feishu", chatId: "oc_group", userId: "ou_user", shareSessionInChannel: true },
        {}
      )
    ).toBe("feishu:oc_group:channel");
  });
});
