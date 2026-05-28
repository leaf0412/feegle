import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatHistoryStore } from "../../../src/agent/chat-history-store.js";
import { SessionStore } from "../../../src/agent/session-store.js";
import { migrate, type RuntimeDb } from "../../../src/app/runtime-db.js";
import { DeleteCommandHandler } from "../../../src/platform/commands/session/delete-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const delDef = defineSlashCommand("delete", "/delete", "del", "session", "cmd:/delete");

function makeContext(sessionKey: string | undefined, args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey,
    sender: { platform: "feishu", userId: "u_1" },
    definition: delDef,
    raw: "/delete",
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

describe("DeleteCommandHandler", () => {
  it("requires explicit 'confirm' arg so accidental /delete does not silently wipe history", async () => {
    const store = new SessionStore(db);
    await store.getOrCreate("feishu:oc_1:u_1", { name: "alpha" });
    const history = new ChatHistoryStore();
    history.append("feishu:oc_1:u_1", { role: "user", content: "important" });
    const handler = new DeleteCommandHandler({ sessionStore: store, chatHistory: history });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("/delete confirm");
    expect(store.get("feishu:oc_1:u_1")).toBeDefined();
    expect(history.get("feishu:oc_1:u_1")).toHaveLength(1);
  });

  it("deletes session and clears history on /delete confirm so the session is fully gone", async () => {
    const store = new SessionStore(db);
    await store.getOrCreate("feishu:oc_1:u_1", { name: "alpha" });
    const history = new ChatHistoryStore();
    history.append("feishu:oc_1:u_1", { role: "user", content: "doomed" });
    const handler = new DeleteCommandHandler({ sessionStore: store, chatHistory: history });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1", "confirm"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("已删除");
    expect(store.get("feishu:oc_1:u_1")).toBeUndefined();
    expect(history.get("feishu:oc_1:u_1")).toEqual([]);
  });

  it("reports gracefully when session does not exist so /delete on a fresh chat is a no-op", async () => {
    const store = new SessionStore(db);
    const handler = new DeleteCommandHandler({ sessionStore: store, chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1", "confirm"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("无需删除");
  });
});
