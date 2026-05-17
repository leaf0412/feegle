import { describe, expect, it, vi } from "vitest";
import type { FeishuClientPort, FeishuFetchedMessage } from "../../src/feishu/feishu-client.js";
import {
  fetchQuotedMessage,
  fetchReplyChain,
  formatReplyChain
} from "../../src/feishu/feishu-reply-chain.js";
import { FeishuUserDirectory } from "../../src/feishu/feishu-user-directory.js";

describe("formatReplyChain", () => {
  it("renders a single-quote prefix when chain has one message", () => {
    expect(
      formatReplyChain([{ senderName: "Alice", senderType: "user", text: "你好" }])
    ).toBe("[Quoted message from Alice]:\n你好\n\n");
  });

  it("renders a numbered chain with role labels for multi-message chains", () => {
    const chain = [
      { senderName: "Alice", senderType: "user" as const, text: "ping" },
      { senderName: "Bot", senderType: "app" as const, text: "pong" }
    ];
    expect(formatReplyChain(chain)).toBe(
      [
        "--- Reply chain (2 messages) ---",
        "[1] Alice (user):",
        "ping\n",
        "[2] Bot (assistant):",
        "pong\n",
        "---\n"
      ].join("\n")
    );
  });

  it("returns empty string for an empty chain", () => {
    expect(formatReplyChain([])).toBe("");
  });
});

describe("fetchReplyChain", () => {
  it("traverses parent_id links up to maxDepth and returns chronological order", async () => {
    const messages: Record<string, FeishuFetchedMessage> = {
      om_3: {
        messageType: "text",
        parentId: "om_2",
        senderId: "ou_alice",
        senderType: "user",
        content: JSON.stringify({ text: "third" }),
        mentions: []
      },
      om_2: {
        messageType: "text",
        parentId: "om_1",
        senderId: "ou_alice",
        senderType: "user",
        content: JSON.stringify({ text: "second" }),
        mentions: []
      },
      om_1: {
        messageType: "text",
        parentId: undefined,
        senderId: "ou_alice",
        senderType: "user",
        content: JSON.stringify({ text: "first" }),
        mentions: []
      }
    };
    const client = fakeClient({
      fetchMessage: vi.fn().mockImplementation(async (id: string) => messages[id]),
      fetchUserName: vi.fn().mockResolvedValue("Alice")
    });
    const directory = new FeishuUserDirectory(client);
    const chain = await fetchReplyChain(client, directory, "om_3");
    expect(chain.map((message) => message.text)).toEqual(["first", "second", "third"]);
  });

  it("stops on circular parent references without throwing", async () => {
    const fetchMessage = vi.fn().mockImplementation(async (id: string) => ({
      messageType: "text",
      parentId: "om_loop",
      senderId: "ou_alice",
      senderType: "user",
      content: JSON.stringify({ text: id }),
      mentions: []
    }));
    const client = fakeClient({ fetchMessage, fetchUserName: vi.fn().mockResolvedValue("Alice") });
    const directory = new FeishuUserDirectory(client);
    const chain = await fetchReplyChain(client, directory, "om_loop");
    expect(chain).toHaveLength(1);
    expect(fetchMessage).toHaveBeenCalledTimes(1);
  });

  it("renders app senders via the peerBots alias map", async () => {
    const message: FeishuFetchedMessage = {
      messageType: "text",
      senderId: "cli_app",
      senderType: "app",
      content: JSON.stringify({ text: "from peer" }),
      mentions: []
    };
    const client = fakeClient({ fetchMessage: vi.fn().mockResolvedValue(message) });
    const directory = new FeishuUserDirectory(client);
    const chain = await fetchReplyChain(client, directory, "om_peer", {
      peerBots: new Map([["cli_app", "Gemini"]])
    });
    expect(chain[0].senderName).toBe("Gemini");
  });

  it("renders post and interactive parents via the content extractors", async () => {
    const post = JSON.stringify({
      zh_cn: { content: [[{ tag: "text", text: "post hi" }]] }
    });
    const card = JSON.stringify({
      body: { tag: "body", property: { elements: [{ tag: "markdown", property: { content: "card hi" } }] } }
    });
    const client = fakeClient({
      fetchMessage: vi
        .fn()
        .mockResolvedValueOnce({
          messageType: "post",
          parentId: "om_card",
          senderId: "ou_alice",
          senderType: "user",
          content: post,
          mentions: []
        })
        .mockResolvedValueOnce({
          messageType: "interactive",
          parentId: undefined,
          senderId: "app_id_card",
          senderType: "app",
          content: card,
          mentions: []
        }),
      fetchUserName: vi.fn().mockResolvedValue("Alice")
    });
    const directory = new FeishuUserDirectory(client);
    const chain = await fetchReplyChain(client, directory, "om_post", {
      peerBots: new Map([["app_id_card", "PeerCard"]])
    });
    expect(chain.map((message) => message.text)).toEqual(["card hi", "post hi"]);
    expect(chain.map((message) => message.senderName)).toEqual(["PeerCard", "Alice"]);
  });
});

describe("fetchQuotedMessage", () => {
  it("returns the formatted reply chain string", async () => {
    const message: FeishuFetchedMessage = {
      messageType: "text",
      senderId: "ou_alice",
      senderType: "user",
      content: JSON.stringify({ text: "hi" }),
      mentions: []
    };
    const client = fakeClient({
      fetchMessage: vi.fn().mockResolvedValue(message),
      fetchUserName: vi.fn().mockResolvedValue("Alice")
    });
    const directory = new FeishuUserDirectory(client);
    await expect(fetchQuotedMessage(client, directory, "om_x")).resolves.toBe(
      "[Quoted message from Alice]:\nhi\n\n"
    );
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
    fetchChatName: fallback,
    fetchChatMembers: async () => [],
    fetchMessage: fallback,
    ...overrides
  };
}
