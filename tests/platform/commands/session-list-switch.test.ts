import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatHistoryStore } from "../../../src/agent/chat-history-store.js";
import { SessionStore } from "../../../src/agent/session-store.js";
import { migrate, type RuntimeDb } from "../../../src/infra/app/runtime-db.js";
import { ListCommandHandler } from "../../../src/platform/commands/session/list-command.js";
import { SwitchCommandHandler } from "../../../src/platform/commands/session/switch-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const listDef = defineSlashCommand("list", "/list", "列出", "session", "nav:/list");
const switchDef = defineSlashCommand("switch", "/switch", "切换", "session", "nav:/list");

function makeContext(sessionKey: string | undefined, args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey,
    sender: { platform: "feishu", userId: "u_1" },
    definition: listDef,
    raw: "/list",
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

describe("ListCommandHandler", () => {
  it("scopes sessions to current chat so /list in chat A does not leak chat B", async () => {
    const store = new SessionStore(db);
    await store.getOrCreate("feishu:oc_1:u_1", { name: "alpha" });
    await store.getOrCreate("feishu:oc_2:u_1", { name: "beta" });
    const handler = new ListCommandHandler({ sessionStore: store, chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("alpha");
    expect(reply.text).not.toContain("beta");
  });

  it("marks the active session so the user can tell which one they are in", async () => {
    const store = new SessionStore(db);
    await store.getOrCreate("feishu:oc_1:u_1", { name: "alpha" });
    await store.getOrCreate("feishu:oc_1:u_2", { name: "gamma" });
    const handler = new ListCommandHandler({ sessionStore: store, chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toMatch(/▶ alpha/);
    expect(reply.text).toMatch(/◻ gamma/);
  });

  it("explains how to start a session when the chat has none yet", async () => {
    const store = new SessionStore(db);
    const handler = new ListCommandHandler({ sessionStore: store, chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("还没有");
  });
});

describe("SwitchCommandHandler", () => {
  it("rejects empty args with usage hint so accidental /switch does nothing destructive", async () => {
    const store = new SessionStore(db);
    const handler = new SwitchCommandHandler({ sessionStore: store });
    const reply = await handler.execute({ ...makeContext("feishu:oc_1:u_1"), definition: switchDef, raw: "/switch" });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("用法");
  });

  it("tells user they are already in the requested session so /switch is idempotent", async () => {
    const store = new SessionStore(db);
    await store.getOrCreate("feishu:oc_1:u_1", { name: "alpha" });
    const handler = new SwitchCommandHandler({ sessionStore: store });
    const reply = await handler.execute({
      ...makeContext("feishu:oc_1:u_1"),
      definition: switchDef,
      raw: "/switch alpha",
      args: "alpha"
    });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("已经在");
  });

  it("redirects to the target chat when match is in a different sessionKey since feegle cannot hot-attach across chats", async () => {
    const store = new SessionStore(db);
    await store.getOrCreate("feishu:oc_2:u_1", { name: "beta" });
    const handler = new SwitchCommandHandler({ sessionStore: store });
    const reply = await handler.execute({
      ...makeContext("feishu:oc_1:u_1"),
      definition: switchDef,
      raw: "/switch beta",
      args: "beta"
    });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("feishu:oc_2:u_1");
    expect(reply.text).toContain("前往");
  });

  it("reports not found with hint so unknown queries get a friendly message", async () => {
    const store = new SessionStore(db);
    const handler = new SwitchCommandHandler({ sessionStore: store });
    const reply = await handler.execute({
      ...makeContext("feishu:oc_1:u_1"),
      definition: switchDef,
      raw: "/switch unknown",
      args: "unknown"
    });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("未找到");
  });
});
