import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import type { AgentCli, AgentChatMessage, AgentRunOptions } from "../../src/agent/agent-cli.js";
import { ChatHistoryStore } from "../../src/agent/chat-history-store.js";
import { FeishuChatHandler } from "@integrations/feishu/feishu-chat-handler.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";
import Database from "better-sqlite3";
import { AgentLoadBalancer } from "../../src/agent/agent-load-balancer.js";
import { SessionStore } from "../../src/agent/session-store.js";
import { migrate } from "@infra/app/runtime-db.js";

describe("FeishuChatHandler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prompts to register a provider when the registry is empty", async () => {
    const client = trackingClient();
    const handler = new FeishuChatHandler({
      client,
      providers: new AgentProviderRegistry(),
      history: new ChatHistoryStore(),
      workspaceDir: "/tmp/ws"
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

  it("uses the single registered provider without requiring /provider use", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => stubAgent({ chat: async () => "hi from codex" })
    });
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore(),
      workspaceDir: "/tmp/ws"
    });

    const result = await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:ou_alice",
      userText: "hello"
    });

    expect(result.status).toBe("delivered");
    expect(JSON.stringify(client.cards.update.at(-1))).toContain("hi from codex");
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
      now: () => (tick += 500),
      workspaceDir: "/tmp/ws"
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

  it("splits an oversized answer into a reply chain instead of truncating it", async () => {
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    const history = new ChatHistoryStore();
    const huge = "段落内容很长。".repeat(8_000); // far past the 28KB single-card limit
    const agent = stubAgent({ chat: async () => huge });
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    providers.setActive("codex");
    const handler = new FeishuChatHandler({ client, providers, history, workspaceDir: "/tmp/ws" });

    const result = await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:ou_alice",
      userText: "write a long doc"
    });

    expect(result.status).toBe("delivered");
    // First card is finalised in place on the preview message.
    expect(client.cards.update.length).toBeGreaterThan(0);
    // Continuation cards arrive as additional reply-chain messages beyond the
    // single preview-start card, each marked as a continuation.
    expect(client.cards.start.length).toBeGreaterThan(1);
    const continuationCards = client.cards.start.slice(1);
    expect(continuationCards.length).toBeGreaterThan(0);
    for (const card of continuationCards) {
      expect(JSON.stringify(card.card)).toContain("（续");
    }
    // Every emitted card stays under the Feishu byte limit.
    const allCards = [...client.cards.update, ...client.cards.start.map((c) => c.card)];
    for (const card of allCards) {
      expect(Buffer.byteLength(JSON.stringify(card), "utf8")).toBeLessThanOrEqual(28_000);
    }
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
      progressHeartbeatMs: 10_000,
      workspaceDir: "/tmp/ws"
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

  it("delays the final preview update when recent progress would hit Feishu message update limits", async () => {
    vi.useFakeTimers();
    const client = trackingClient({ minUpdateGapMs: 1000 });
    const providers = new AgentProviderRegistry();
    const agent = stubAgent({
      chat: async (_messages, options) => {
        await options?.onProgress?.({ kind: "thinking", text: "分析中" });
        return "最终答案";
      }
    });
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    providers.setActive("codex");
    let nowMs = 0;
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore(),
      now: () => nowMs,
      progressUpdateMinIntervalMs: 1000,
      workspaceDir: "/tmp/ws"
    });

    const handling = handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:channel",
      userText: "do it"
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(client.cards.update).toHaveLength(1);
    expect(JSON.stringify(client.cards.update[0])).toContain("分析中");

    nowMs = 1000;
    await vi.advanceTimersByTimeAsync(1000);
    await expect(handling).resolves.toEqual({ status: "delivered" });

    expect(client.cards.update).toHaveLength(2);
    expect(JSON.stringify(client.cards.update.at(-1))).toContain("最终答案");
  });

  it("runs the agent in the injected global workspace dir so chats always have a cwd", async () => {
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
      workspaceDir: "/tmp/ws"
    });

    await handler.handle({
      chatId: "oc_1",
      triggerMessageId: "om_trigger",
      sessionKey: "feishu:oc_1:channel",
      userText: "inspect this repo"
    });

    expect(seenCwd).toBe("/tmp/ws");
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
      history: new ChatHistoryStore(),
      workspaceDir: "/tmp/ws"
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
    const handler = new FeishuChatHandler({ client, providers, history, workspaceDir: "/tmp/ws" });

    await handler.handle({ chatId: "oc_1", triggerMessageId: "om_1", sessionKey: "sk_1", userText: "one" });
    await handler.handle({ chatId: "oc_1", triggerMessageId: "om_2", sessionKey: "sk_1", userText: "two" });

    expect(seen[1]).toEqual([
      { role: "user", content: "one" },
      { role: "assistant", content: "ack" },
      { role: "user", content: "two" }
    ]);
  });

  it("pins a new session to the balanced provider and reuses it on later turns", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    const sessionStore = new SessionStore(db);
    const balancer = new AgentLoadBalancer();
    const providers = new AgentProviderRegistry();
    const calls: string[] = [];
    providers.register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => stubAgent({ chat: async () => { calls.push("codex"); return "c"; } })
    });
    providers.register({
      kind: "claude_code",
      displayName: "Claude Code",
      buildAgent: () => stubAgent({ chat: async () => { calls.push("claude"); return "k"; } })
    });
    const handler = new FeishuChatHandler({
      client: trackingClient(),
      providers,
      history: new ChatHistoryStore(),
      sessionStore,
      balancer,
      workspaceDir: "/tmp/ws"
    });

    await handler.handle({ chatId: "oc_1", triggerMessageId: "m1", sessionKey: "sk_1", userText: "one" });
    const pinned = sessionStore.get("sk_1")?.agentKind;
    expect(pinned).toBeDefined();

    await handler.handle({ chatId: "oc_1", triggerMessageId: "m2", sessionKey: "sk_1", userText: "two" });
    expect(new Set(calls).size).toBe(1); // sticky: one session stays on one agent
  });

  it("re-pins and surfaces a notice when a session's agent was unregistered", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    const sessionStore = new SessionStore(db);
    await sessionStore.assignAgent("sk_1", "codex"); // pin to an agent we will NOT register
    const client = trackingClient();
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "claude_code",
      displayName: "Claude Code",
      buildAgent: () => stubAgent({ chat: async () => "k" })
    });
    const handler = new FeishuChatHandler({
      client,
      providers,
      history: new ChatHistoryStore(),
      sessionStore,
      balancer: new AgentLoadBalancer(),
      workspaceDir: "/tmp/ws"
    });

    const result = await handler.handle({ chatId: "oc_1", triggerMessageId: "m1", sessionKey: "sk_1", userText: "hi" });

    expect(result.status).toBe("delivered");
    expect(sessionStore.get("sk_1")?.agentKind).toBe("claude_code");
    expect(JSON.stringify(client.cards.update.at(-1))).toContain("已下线");
  });

  it("releases the in-flight slot even when the turn throws so the agent is not stuck busy", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    const sessionStore = new SessionStore(db);
    const balancer = new AgentLoadBalancer();
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => stubAgent({ chat: async () => { throw new Error("boom"); } })
    });
    const handler = new FeishuChatHandler({
      client: trackingClient(),
      providers,
      history: new ChatHistoryStore(),
      sessionStore,
      balancer,
      workspaceDir: "/tmp/ws"
    });

    const result = await handler.handle({ chatId: "oc_1", triggerMessageId: "m1", sessionKey: "sk_1", userText: "hi" });

    expect(result.status).toBe("failed");
    expect(balancer.inFlightCount("codex")).toBe(0);
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

function trackingClient(options: { minUpdateGapMs?: number } = {}): TrackingClient {
  const replies: Array<{ messageId: string; text: string }> = [];
  const startCalls: Array<{ replyToMessageId?: string; card: unknown }> = [];
  const updateCalls: Array<unknown> = [];
  let lastUpdateAt = -Infinity;
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
      const now = Date.now();
      if (options.minUpdateGapMs !== undefined && now - lastUpdateAt < options.minUpdateGapMs) {
        throw new Error("Request failed with status code 400");
      }
      lastUpdateAt = now;
      updateCalls.push(card);
    }
  });
  return { ...base, replies, cards: { start: startCalls, update: updateCalls } };
}
