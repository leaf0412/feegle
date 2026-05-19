import { describe, expect, it, vi } from "vitest";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import {
  FeishuUserDirectory,
  isValidFeishuLookupID,
  resolveMentionsInContent
} from "../../src/feishu/feishu-user-directory.js";

describe("isValidFeishuLookupID", () => {
  it("accepts open ids containing letters, digits, underscores, dashes", () => {
    expect(isValidFeishuLookupID("ou_abc_123-foo")).toBe(true);
  });

  it("rejects empty strings and strings with disallowed characters", () => {
    expect(isValidFeishuLookupID("")).toBe(false);
    expect(isValidFeishuLookupID("ou abc")).toBe(false);
    expect(isValidFeishuLookupID("ou@abc")).toBe(false);
  });
});

describe("FeishuUserDirectory", () => {
  it("caches successful user name lookups", async () => {
    const fetchUserName = vi.fn().mockResolvedValue("Alice");
    const directory = new FeishuUserDirectory(fakeClient({ fetchUserName }));

    await expect(directory.resolveUserName("ou_alice")).resolves.toBe("Alice");
    await expect(directory.resolveUserName("ou_alice")).resolves.toBe("Alice");
    expect(fetchUserName).toHaveBeenCalledTimes(1);
  });

  it("falls back to the id when the lookup does not return a name", async () => {
    const directory = new FeishuUserDirectory(
      fakeClient({ fetchUserName: vi.fn().mockResolvedValue(undefined) })
    );
    await expect(directory.resolveUserName("ou_missing")).resolves.toBe("ou_missing");
  });

  it("rejects invalid lookup ids without calling the API", async () => {
    const fetchUserName = vi.fn();
    const directory = new FeishuUserDirectory(fakeClient({ fetchUserName }));
    await expect(directory.resolveUserName("ou abc")).resolves.toBe("ou abc");
    expect(fetchUserName).not.toHaveBeenCalled();
  });

  it("marks duplicate names as ambiguous (empty memberId) in chat member cache", async () => {
    const directory = new FeishuUserDirectory(
      fakeClient({
        fetchChatMembers: vi.fn().mockResolvedValue([
          { memberId: "ou_1", name: "Alice" },
          { memberId: "ou_2", name: "Alice" },
          { memberId: "ou_3", name: "Bob" }
        ])
      })
    );
    const members = await directory.getChatMembers("oc_1");
    expect(members.get("Alice")).toBe("");
    expect(members.get("Bob")).toBe("ou_3");
  });

  it("refreshes chat members after the cache TTL expires", async () => {
    const fetchChatMembers = vi
      .fn()
      .mockResolvedValueOnce([{ memberId: "ou_1", name: "Alice" }])
      .mockResolvedValueOnce([{ memberId: "ou_2", name: "Alice" }]);
    let now = 1_000_000;
    const directory = new FeishuUserDirectory(fakeClient({ fetchChatMembers }), {
      now: () => now,
      cacheTtlMs: 60_000
    });
    await directory.getChatMembers("oc_1");
    now += 30_000;
    await directory.getChatMembers("oc_1");
    expect(fetchChatMembers).toHaveBeenCalledTimes(1);
    now += 60_000;
    await directory.getChatMembers("oc_1");
    expect(fetchChatMembers).toHaveBeenCalledTimes(2);
  });
});

describe("resolveMentionsInContent", () => {
  it("rewrites @name to interactive card at tags when content contains markdown", async () => {
    const directory = new FeishuUserDirectory(
      fakeClient({
        fetchChatMembers: vi
          .fn()
          .mockResolvedValue([
            { memberId: "ou_alice", name: "Alice" },
            { memberId: "ou_alice2", name: "Alice Wong" }
          ])
      })
    );
    const result = await resolveMentionsInContent(directory, "oc_1", "**hi** @Alice Wong, @Alice");
    expect(result).toBe("**hi** <at id=ou_alice2></at>, <at id=ou_alice></at>");
  });

  it("uses text-format at tags when content has no markdown", async () => {
    const directory = new FeishuUserDirectory(
      fakeClient({
        fetchChatMembers: vi.fn().mockResolvedValue([{ memberId: "ou_alice", name: "Alice" }])
      })
    );
    const result = await resolveMentionsInContent(directory, "oc_1", "hi @Alice");
    expect(result).toBe('hi <at user_id="ou_alice">Alice</at>');
  });

  it("leaves content untouched when no @ mention is present", async () => {
    const fetchChatMembers = vi.fn();
    const directory = new FeishuUserDirectory(fakeClient({ fetchChatMembers }));
    await expect(resolveMentionsInContent(directory, "oc_1", "hello")).resolves.toBe("hello");
    expect(fetchChatMembers).not.toHaveBeenCalled();
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
    fetchBotOpenId: fallback,
    fetchUserName: fallback,
    fetchUserEmail: fallback,
    fetchChatName: fallback,
    fetchChatMembers: async () => [],
    fetchMessage: fallback,
    fetchMergeForwardItems: async () => [],
    sendImage: fallback,
    sendAudio: fallback,
    downloadResource: fallback,
    downloadImage: fallback,
    deleteMessage: async () => {},
    ...overrides
  };
}
