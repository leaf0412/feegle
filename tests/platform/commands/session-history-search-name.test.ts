import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatHistoryStore } from "../../../src/agent/chat-history-store.js";
import { SessionStore } from "../../../src/agent/session-store.js";
import { HistoryCommandHandler } from "../../../src/platform/commands/session/history-command.js";
import { NameCommandHandler } from "../../../src/platform/commands/session/name-command.js";
import { SearchCommandHandler } from "../../../src/platform/commands/session/search-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const histDef = defineSlashCommand("history", "/history", "h", "session", "nav:/history");
const searchDef = defineSlashCommand("search", "/search", "s", "session", "cmd:/search");
const nameDef = defineSlashCommand("name", "/name", "n", "session", "cmd:/name");

function makeContext(sessionKey: string | undefined, args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey,
    sender: { platform: "feishu", userId: "u_1" },
    definition: histDef,
    raw: "/history",
    args
  };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-hsn-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("HistoryCommandHandler", () => {
  it("returns latest 20 by default so /history is bounded even on chatty sessions", async () => {
    const history = new ChatHistoryStore({ maxMessages: 100 });
    for (let i = 0; i < 30; i++) {
      history.append("feishu:oc_1:u_1", { role: "user", content: `msg ${i}` });
    }
    const handler = new HistoryCommandHandler({ chatHistory: history });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("最近 20 条");
    expect(reply.text).toContain("msg 29");
    expect(reply.text).not.toContain("msg 9 \n"); // msg 9 should be out of range
  });

  it("honors numeric arg up to 100 so users can ask for a deeper window", async () => {
    const history = new ChatHistoryStore({ maxMessages: 200 });
    for (let i = 0; i < 50; i++) {
      history.append("feishu:oc_1:u_1", { role: "assistant", content: `r${i}` });
    }
    const handler = new HistoryCommandHandler({ chatHistory: history });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1", "40"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("最近 40 条");
  });

  it("reports empty when no messages so /history does not crash on a fresh session", async () => {
    const handler = new HistoryCommandHandler({ chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("还没有消息");
  });
});

describe("SearchCommandHandler", () => {
  it("usage hint when args empty so /search alone doesn't silently search everything", async () => {
    const store = await SessionStore.load(home);
    const handler = new SearchCommandHandler({ sessionStore: store, chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute({ ...makeContext("feishu:oc_1:u_1"), definition: searchDef, raw: "/search" });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("用法");
  });

  it("finds matches across all sessions and shows snippet with session label", async () => {
    const store = await SessionStore.load(home);
    await store.getOrCreate("feishu:oc_1:u_1", { name: "alpha" });
    await store.getOrCreate("feishu:oc_2:u_1", { name: "beta" });
    const history = new ChatHistoryStore();
    history.append("feishu:oc_1:u_1", { role: "user", content: "需要登录 GraphQL 接口" });
    history.append("feishu:oc_2:u_1", { role: "assistant", content: "GraphQL schema 已生成" });
    const handler = new SearchCommandHandler({ sessionStore: store, chatHistory: history });
    const reply = await handler.execute({
      ...makeContext("feishu:oc_1:u_1"),
      definition: searchDef,
      raw: "/search graphql",
      args: "graphql"
    });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("[alpha]");
    expect(reply.text).toContain("[beta]");
    expect(reply.text).toContain("匹配 2 条");
  });

  it("reports not found when no message matches so empty results are explicit", async () => {
    const store = await SessionStore.load(home);
    const handler = new SearchCommandHandler({ sessionStore: store, chatHistory: new ChatHistoryStore() });
    const reply = await handler.execute({
      ...makeContext("feishu:oc_1:u_1"),
      definition: searchDef,
      raw: "/search xyz",
      args: "xyz"
    });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("未找到");
  });
});

describe("NameCommandHandler", () => {
  it("rejects empty args so accidental /name does not silently clear an existing label", async () => {
    const store = await SessionStore.load(home);
    const handler = new NameCommandHandler({ sessionStore: store });
    const reply = await handler.execute({ ...makeContext("feishu:oc_1:u_1"), definition: nameDef, raw: "/name", args: "" });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("用法");
  });

  it("tells user to /new first when session is missing so renaming has clear semantics", async () => {
    const store = await SessionStore.load(home);
    const handler = new NameCommandHandler({ sessionStore: store });
    const reply = await handler.execute({
      ...makeContext("feishu:oc_1:u_1"),
      definition: nameDef,
      raw: "/name alpha",
      args: "alpha"
    });
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("尚未开始");
  });

  it("persists the new name so /current later shows the updated label", async () => {
    const store = await SessionStore.load(home);
    await store.getOrCreate("feishu:oc_1:u_1");
    const handler = new NameCommandHandler({ sessionStore: store });
    await handler.execute({
      ...makeContext("feishu:oc_1:u_1"),
      definition: nameDef,
      raw: "/name auth-rewrite",
      args: "auth-rewrite"
    });
    expect(store.get("feishu:oc_1:u_1")?.name).toBe("auth-rewrite");
  });
});
