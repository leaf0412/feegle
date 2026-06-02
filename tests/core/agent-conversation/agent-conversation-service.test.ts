import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Agent, AgentEvent } from "@integrations/agent/agent-session.js";
import { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { ChatHistoryStore } from "@integrations/agent/chat-history-store.js";
import { SessionStore } from "@integrations/agent/session-store.js";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { AgentConversationService } from "@core/agent-conversation/agent-conversation-service.js";

// An Agent that streams the given events and records each turn's prompt + cwd.
function recordingAgent(events: AgentEvent[]): {
  agent: Agent;
  calls: Array<{ prompt: string; cwd?: string }>;
} {
  const calls: Array<{ prompt: string; cwd?: string }> = [];
  const agent: Agent = {
    startSession(options) {
      return {
        async *send(prompt: string) {
          calls.push({ prompt, cwd: options?.cwd });
          for (const event of events) yield event;
        },
        currentSessionId: () => undefined,
        async close() {}
      };
    }
  };
  return { agent, calls };
}

describe("AgentConversationService", () => {
  let tempDir: string;
  let db: RuntimeDb;
  let providers: AgentProviderRegistry;
  let history: ChatHistoryStore;
  let sessionStore: SessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "feegle-agent-conversation-"));
    db = openRuntimeDb(join(tempDir, "feegle.db"));
    providers = new AgentProviderRegistry();
    history = new ChatHistoryStore();
    sessionStore = new SessionStore(db, { clock: () => new Date("2026-05-31T07:20:00.000Z") });
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("calls the selected agent and persists user and assistant history", async () => {
    const { agent, calls } = recordingAgent([
      { kind: "text", text: "agent answer" },
      { kind: "result" }
    ]);
    providers.register({
      kind: "mock",
      displayName: "Mock Agent",
      buildAgent: () => agent
    });

    const service = new AgentConversationService({
      providers,
      history,
      sessionStore,
      workspaceDir: "/tmp/workspace",
      now: () => 1780212000000
    });

    const result = await service.run({
      workspaceId: "default",
      projectId: null,
      conversationKey: "feishu:oc_1",
      sessionKey: "feishu:oc_1:user_1",
      userId: "user_1",
      userText: "帮我看一下状态",
      source: { pluginId: "feishu", chatId: "oc_1", messageId: "om_1" }
    });

    expect(result).toMatchObject({
      status: "delivered",
      provider: "Mock Agent",
      answer: "agent answer"
    });
    // History is replayed into a single flattened prompt; cwd reaches the session.
    expect(calls).toEqual([{ prompt: "User: 帮我看一下状态", cwd: "/tmp/workspace" }]);
    expect(history.get("feishu:oc_1:user_1")).toEqual([
      { role: "user", content: "帮我看一下状态" },
      { role: "assistant", content: "agent answer" }
    ]);
  });

  it("returns no_provider without calling an agent when none are registered", async () => {
    const service = new AgentConversationService({
      providers,
      history,
      sessionStore,
      workspaceDir: "/tmp/workspace"
    });

    const result = await service.run({
      workspaceId: "default",
      projectId: null,
      conversationKey: "feishu:oc_1",
      sessionKey: "feishu:oc_1:user_1",
      userId: "user_1",
      userText: "hello",
      source: { pluginId: "feishu", chatId: "oc_1", messageId: "om_1" }
    });

    expect(result).toEqual({
      status: "no_provider",
      reason: "no agent provider registered",
      progress: []
    });
    expect(history.get("feishu:oc_1:user_1")).toEqual([]);
  });

  it("captures agent progress as platform-neutral conversation progress", async () => {
    providers.register({
      kind: "mock",
      displayName: "Mock Agent",
      buildAgent: () =>
        recordingAgent([
          { kind: "tool_use", tool: "read_file", text: "Reading project context" },
          { kind: "text", text: "done" },
          { kind: "result" }
        ]).agent
    });

    const service = new AgentConversationService({
      providers,
      history,
      sessionStore,
      workspaceDir: "/tmp/workspace",
      now: () => 1780212000000
    });

    const result = await service.run({
      workspaceId: "default",
      projectId: null,
      conversationKey: "feishu:oc_1",
      sessionKey: "feishu:oc_1:user_1",
      userId: "user_1",
      userText: "hello",
      source: { pluginId: "feishu", chatId: "oc_1", messageId: "om_1" }
    });

    expect(result).toMatchObject({
      status: "delivered",
      progress: [
        { type: "started", provider: "Mock Agent", at: "2026-05-31T07:20:00.000Z" },
        {
          type: "progress",
          provider: "Mock Agent",
          kind: "tool_use",
          tool: "read_file",
          text: "Reading project context",
          at: "2026-05-31T07:20:00.000Z"
        }
      ]
    });
  });
});
