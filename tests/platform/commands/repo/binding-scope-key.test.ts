import { describe, expect, it } from "vitest";
import { resolveBindingScopeKey, resolveBindingScopeNoun } from "../../../../src/platform/commands/repo/binding-scope-key.js";
import type { SlashCommandContext } from "../../../../src/platform/slash-command-handler.js";

function ctx(overrides: Partial<SlashCommandContext>): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sender: { platform: "feishu", userId: "ou_alice" },
    definition: { id: "x", command: "/x", groupKey: "repo", helpKey: "" } as never,
    raw: "/x",
    args: "",
    ...overrides
  };
}

describe("resolveBindingScopeKey", () => {
  it("uses the chat id for group chats so a group shares one binding", () => {
    expect(resolveBindingScopeKey(ctx({ chatType: "group" }))).toBe("oc_1");
  });

  it("uses the user id for single chat so a binding is per-user, not per-conversation", () => {
    expect(resolveBindingScopeKey(ctx({ chatType: "p2p" }))).toBe("user:ou_alice");
  });

  it("treats an unknown chat type as single chat (user-scoped)", () => {
    expect(resolveBindingScopeKey(ctx({ chatType: undefined }))).toBe("user:ou_alice");
  });

  it("throws for a single chat with no user id instead of silently falling back to chat id", () => {
    expect(() =>
      resolveBindingScopeKey(ctx({ chatType: "p2p", sender: { platform: "feishu", userId: "" } }))
    ).toThrow(/user id/i);
  });

  it("labels a group scope as 本群", () => {
    expect(resolveBindingScopeNoun(ctx({ chatType: "group" }))).toBe("本群");
  });

  it("labels a single chat as 你（单聊）", () => {
    expect(resolveBindingScopeNoun(ctx({ chatType: "p2p" }))).toBe("你（单聊）");
  });
});
