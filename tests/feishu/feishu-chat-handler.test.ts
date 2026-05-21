import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import type { AgentCli, AgentChatMessage, AgentRunOptions } from "../../src/agent/agent-cli.js";
import { ChatHistoryStore } from "../../src/agent/chat-history-store.js";
import { FeishuChatHandler } from "../../src/feishu/feishu-chat-handler.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";

describe("FeishuChatHandler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prompts to register a provider when the registry is empty", async () => {
    const client = trackingClient();
    const handler = new FeishuChatHandler({
      client,
      providers: new AgentProviderRegistry(),
      history: new ChatHistoryStore()
    });

    const result = await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:ou_alice",
      userText: "hello"
    });

    expect(result).toEqual({ status: "no_provider" });
    expect(client.replies).toHaveLength(1);
    expect(client.replies[0]).toMatchObject({ messageId: "om_trigger" });
    expect(client.replies[0].text).toContain("尚未注册任何 agent provider");
    expect(client.replies[0].text).toContain("/provider register codex");
    expect(client.cards.start).toHaveLength(0);
  });

  it("prompts to activate a registered provider when none is active", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => ({}) as never
    });
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore()
    });

    const result = await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:ou_alice",
      userText: "hello"
    });

    expect(result).toEqual({ status: "no_provider" });
    expect(client.replies[0].text).toContain("已注册 codex");
    expect(client.replies[0].text).toContain("/provider use");
  });

  it("streams agent progress into a preview card and finalises with the answer", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    const history = new ChatHistoryStore();
    const agent = stubAgent({
      chat: async (_messages, options) => {
        await options?.onProgress?.({ kind: "tool_use", tool: "Bash", text: "ls -la" });
        await options?.onProgress?.({ kind: "tool_result", tool: "Bash", text: "total 0" });
        return "I am Codex.";
      }
    });
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    providers.setActive("codex");
    let tick = 1000;
    const handler = new FeishuChatHandler({
      client,
      providers,
      history,
      now: () => (tick += 500)
    });

    const result = await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:ou_alice",
      userText: "what's your model?"
    });

    expect(result.status).toBe("delivered");
    expect(client.cards.start).toHaveLength(1);
    expect(client.cards.start[0]).toMatchObject({ replyToMessageId: "om_trigger" });
    expect(client.cards.update.length).toBeGreaterThan(0);
    expect(JSON.stringify(client.cards.update.at(-1))).toContain("I am Codex.");
    expect(history.get("feishu:oc_1:ou_alice")).toEqual([
      { role: "user", content: "what's your model?" },
      { role: "assistant", content: "I am Codex." }
    ]);
  });

  it("keeps the preview card alive while the agent is still running", async () => {
    vi.useFakeTimers();
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    let resolveChat: ((value: string) => void) | undefined;
    const chatPromise = new Promise<string>((resolve) => {
      resolveChat = resolve;
    });
    const agent = stubAgent({
      chat: async () => chatPromise
    });
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    providers.setActive("codex");
    let tick = 1000;
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore(),
      now: () => (tick += 5000),
      progressHeartbeatMs: 10_000
    });

    const handling = handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:channel",
      userText: "long task"
    });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(client.cards.update).toHaveLength(1);
    expect(JSON.stringify(client.cards.update[0])).toContain("运行中");

    resolveChat?.("finished");
    await expect(handling).resolves.toEqual({ status: "delivered" });
    expect(JSON.stringify(client.cards.update.at(-1))).toContain("Done");
    const updatesAfterFinish = client.cards.update.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(client.cards.update).toHaveLength(updatesAfterFinish);
  });

  it("passes the group-bound workspace path as cwd so chat turns run in the selected project", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    let seenCwd: string | undefined;
    const agent = stubAgent({
      chat: async (_messages, options) => {
        seenCwd = options?.cwd;
        return "done";
      }
    });
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    providers.setActive("codex");
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore(),
      chatBindingStore: {
        get: (chatId: string) => ({
          chatId,
          repositoryIds: [],
          workspaceId: "ws_feegle",
          updatedAt: "2026-05-21T00:00:00.000Z"
        })
      } as never,
      workspaceStore: {
        get: (id: string) =>
          id === "ws_feegle"
            ? { id, path: "/Users/yb/Desktop/code/personal/feegle", createdAt: "2026-05-21T00:00:00.000Z" }
            : undefined
      } as never
    });

    await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:channel",
      userText: "inspect this repo"
    });

    expect(seenCwd).toBe("/Users/yb/Desktop/code/personal/feegle");
  });

  it("opens a directory setup card instead of running the agent when no group workspace is bound", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    const chat = vi.fn(async () => "done");
    const agent = stubAgent({ chat });
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    providers.setActive("codex");
    const pending: unknown[] = [];
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore(),
      chatWorkspaceStore: {
        get: () => undefined
      },
      pendingInteractions: {
        put: async (input: unknown) => {
          pending.push(input);
          return input;
        }
      },
      configuredWorkspaces: {
        feegle: "/repo/feegle"
      },
      interactionIdFactory: () => "pi_1",
      now: () => Date.parse("2026-05-21T00:00:00.000Z")
    });

    const result = await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_1",
      sessionKey: "feishu:oc_1:channel",
      userText: "inspect this repo"
    });

    expect(result).toEqual({ status: "awaiting_workspace", interactionId: "pi_1" });
    expect(client.cards.start).toHaveLength(1);
    expect(JSON.stringify(client.cards.start[0]?.card)).toContain("选择工作目录");
    expect(JSON.stringify(client.cards.start[0]?.card)).toContain("act:/workbench directory submit");
    expect(pending).toEqual([
      expect.objectContaining({
        interactionId: "pi_1",
        chatId: "oc_1",
        messageId: "om_1",
        kind: "directory_setup",
        payload: { sessionKey: "feishu:oc_1:channel", userText: "inspect this repo" },
        expiresAt: "2026-05-22T00:00:00.000Z"
      })
    ]);
    expect(chat).not.toHaveBeenCalled();
  });

  it("falls into the error status when the agent throws and updates the card to red", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => stubAgent({ chat: async () => { throw new Error("boom"); } })
    });
    providers.setActive("codex");
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore()
    });

    const result = await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:ou_alice",
      userText: "hi"
    });

    if (result.status !== "failed") {
      throw new Error(`expected failed result, got ${result.status}`);
    }
    expect(result.reason).toBe("boom");
    const lastUpdate = JSON.stringify(client.cards.update.at(-1));
    expect(lastUpdate).toContain("red");
    expect(lastUpdate).toContain("boom");
  });

  it("appends conversation history across turns for the same session", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    const history = new ChatHistoryStore();
    const seen: AgentChatMessage[][] = [];
    const agent = stubAgent({
      chat: async (messages) => {
        seen.push(messages.map((message) => ({ ...message })));
        return "ack";
      }
    });
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    providers.setActive("codex");
    const handler = new FeishuChatHandler({ client, providers, history });

    await handler.handle({ chatId: "oc_1", triggerMessageId: "om_1", sessionKey: "sk_1", userText: "one" });
    await handler.handle({ chatId: "oc_1", triggerMessageId: "om_2", sessionKey: "sk_1", userText: "two" });

    expect(seen[1]).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "ack" },
      { role: "user", content: "two" }
    ]);
  });
});

function stubAgent(overrides: Partial<AgentCli>): AgentCli {
  return {
    chat: async () => "stub",
    generatePrototype: async () => "",
    generatePlan: async () => "",
    runDevelopmentTask: async () => "",
    ...overrides
  } as AgentCli;
}

interface TrackingClient extends FeishuClientPort {
  replies: Array<{ messageId: string; text: string }>;
  cards: {
    start: Array<{ replyToMessageId?: string; card: unknown }>;
    update: Array<unknown>;
  };
}

function trackingClient(): TrackingClient {
  const replies: Array<{ messageId: string; text: string }> = [];
  const startCalls: Array<{ replyToMessageId?: string; card: unknown }> = [];
  const updateCalls: Array<unknown> = [];
  let nextId = 1;
  const base = makeFakeFeishuClient({
    async replyText(messageId, text) {
      replies.push({ messageId, text });
      return "om_reply";
    },
    async replyInteractiveCard(messageId, card) {
      const id = `om_preview_${nextId++}`;
      startCalls.push({ replyToMessageId: messageId, card });
      return id;
    },
    async sendInteractiveCard(_chatId, card) {
      const id = `om_preview_${nextId++}`;
      startCalls.push({ card });
      return id;
    },
    async updateInteractiveCard(_messageId, card) {
      updateCalls.push(card);
    }
  });
  return { ...base, replies, cards: { start: startCalls, update: updateCalls } };
}
