import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import { ChatHistoryStore } from "../../../src/agent/chat-history-store.js";
import { SessionStore } from "../../../src/agent/session-store.js";
import { migrate, type RuntimeDb } from "../../../src/infra/app/runtime-db.js";
import { CurrentCommandHandler } from "../../../src/platform/commands/session/current-command.js";
import { NewCommandHandler } from "../../../src/platform/commands/session/new-command.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";

const newDef = defineSlashCommand("new", "/new", "新", "session", "act:/new");
const currentDef = defineSlashCommand("current", "/current", "当前", "session", "nav:/current");

function makeContext(sessionKey: string | undefined, args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey,
    sender: { platform: "feishu", userId: "u_1" },
    definition: newDef,
    raw: "/new",
    args
  };
}

let db: RuntimeDb;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

afterEach(() => {
  db.close();
});

describe("NewCommandHandler", () => {
  it("aborts when sessionKey is missing so test fixtures and broken flows don't quietly clear histories", async () => {
    const store = new SessionStore(db);
    const handler = new NewCommandHandler({
      sessionStore: store,
      chatHistory: new ChatHistoryStore(),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute(makeContext(undefined));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("不可用");
  });

  it("clears chat history so users actually start fresh after /new", async () => {
    const store = new SessionStore(db);
    const history = new ChatHistoryStore();
    history.append("feishu:oc_1:u_1", { role: "user", content: "old" });
    const handler = new NewCommandHandler({
      sessionStore: store,
      chatHistory: history,
      providers: new AgentProviderRegistry()
    });
    await handler.execute(makeContext("feishu:oc_1:u_1"));
    expect(history.get("feishu:oc_1:u_1")).toEqual([]);
  });

  it("records the active provider kind so /current later shows which agent the session was opened on", async () => {
    const store = new SessionStore(db);
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
    providers.setActive("codex");
    const handler = new NewCommandHandler({
      sessionStore: store,
      chatHistory: new ChatHistoryStore(),
      providers
    });
    await handler.execute(makeContext("feishu:oc_1:u_1"));
    expect(store.get("feishu:oc_1:u_1")?.agentKind).toBe("codex");
  });

  it("uses the args as session name so users can label sessions inline", async () => {
    const store = new SessionStore(db);
    const handler = new NewCommandHandler({
      sessionStore: store,
      chatHistory: new ChatHistoryStore(),
      providers: new AgentProviderRegistry()
    });
    await handler.execute(makeContext("feishu:oc_1:u_1", "feature-auth-rewrite"));
    expect(store.get("feishu:oc_1:u_1")?.name).toBe("feature-auth-rewrite");
  });
});

describe("CurrentCommandHandler", () => {
  it("tells users session not yet started so they understand they can start by chatting", async () => {
    const store = new SessionStore(db);
    const handler = new CurrentCommandHandler({ sessionStore: store, chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute({ ...makeContext("feishu:oc_1:u_1"), definition: currentDef, raw: "/current" });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("尚未开始");
  });

  it("renders metadata + message count so users can see the session at a glance", async () => {
    const store = new SessionStore(db);
    await store.getOrCreate("feishu:oc_1:u_1", { agentKind: "codex", name: "alpha" });
    const history = new ChatHistoryStore();
    history.append("feishu:oc_1:u_1", { role: "user", content: "hi" });
    history.append("feishu:oc_1:u_1", { role: "assistant", content: "hello" });
    const handler = new CurrentCommandHandler({ sessionStore: store, chatHistory: history });
    const reply = await handler.execute({ ...makeContext("feishu:oc_1:u_1"), definition: currentDef, raw: "/current" });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("alpha");
    expect(reply.text).toContain("codex");
    expect(reply.text).toContain("消息数: 2");
  });
});
