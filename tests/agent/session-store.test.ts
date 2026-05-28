import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionStore } from "../../src/agent/session-store.js";

let home: string;
let clock: { current: Date };

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-session-store-"));
  clock = { current: new Date("2026-05-19T10:00:00.000Z") };
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function makeClock() {
  return () => clock.current;
}

describe("SessionStore", () => {
  it("creates sessions.json on first load so feegle does not crash on a fresh home", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    expect(store.list()).toEqual([]);
  });

  it("getOrCreate returns existing session so reopening a chat does not duplicate state", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    const first = await store.getOrCreate("feishu:oc_a:root:m_1", { agentKind: "claude_code" });
    const second = await store.getOrCreate("feishu:oc_a:root:m_1", { agentKind: "codex" });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.agentKind).toBe("claude_code");
    expect(store.list()).toHaveLength(1);
  });

  it("touch updates lastActiveAt so /list ordering can reflect recency", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    const initial = await store.getOrCreate("feishu:oc_a:root:m_1");
    clock.current = new Date("2026-05-19T11:00:00.000Z");
    const touched = await store.touch("feishu:oc_a:root:m_1");
    expect(touched.lastActiveAt).toBe("2026-05-19T11:00:00.000Z");
    expect(touched.createdAt).toBe(initial.createdAt);
  });

  it("rename rejects empty names so a /name with no args cannot silently wipe a label", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1");
    await expect(store.rename("feishu:oc_a:root:m_1", "   ")).rejects.toThrow(/empty/);
  });

  it("close marks status closed so /switch can be implemented as close+touch", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1");
    const closed = await store.close("feishu:oc_a:root:m_1");
    expect(closed.status).toBe("closed");
  });

  it("remove returns false when sessionKey is unknown so callers can render 'not found' messages safely", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    expect(await store.remove("feishu:oc_a:root:m_1")).toBe(false);
  });

  it("persists across reloads so SessionStore survives bot restarts", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1", { name: "alpha" });
    const reloaded = await SessionStore.load(home, { clock: makeClock() });
    expect(reloaded.get("feishu:oc_a:root:m_1")?.name).toBe("alpha");
  });

  it("listByPrefix scopes sessions to a chat so /list per group does not leak other chats", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1");
    await store.getOrCreate("feishu:oc_a:root:m_2");
    await store.getOrCreate("feishu:oc_b:root:m_3");
    const scoped = store.listByPrefix("feishu:oc_a:");
    expect(scoped.map((s) => s.sessionKey)).toEqual([
      "feishu:oc_a:root:m_1",
      "feishu:oc_a:root:m_2"
    ]);
  });

  it("assignAgent creates a session pinned to the chosen agent when none exists", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    const record = await store.assignAgent("feishu:oc_a:root:m_1", "codex");
    expect(record.agentKind).toBe("codex");
    expect(store.get("feishu:oc_a:root:m_1")?.agentKind).toBe("codex");
  });

  it("assignAgent re-pins an existing session so a removed agent can be replaced", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1", { agentKind: "claude_code" });
    const record = await store.assignAgent("feishu:oc_a:root:m_1", "codex");
    expect(record.agentKind).toBe("codex");
    expect(store.list()).toHaveLength(1);
  });

  it("setAcpSessionId stores the ACP session id so later turns can resume", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    await store.getOrCreate("k", { agentKind: "x" });
    const r = await store.setAcpSessionId("k", "acp_abc");
    expect(r.acpSessionId).toBe("acp_abc");
    expect(store.get("k")?.acpSessionId).toBe("acp_abc");
  });

  it("setAcpSessionId throws when the session does not exist (no silent create)", async () => {
    const store = await SessionStore.load(home, { clock: makeClock() });
    await expect(store.setAcpSessionId("missing", "acp_x")).rejects.toThrow(/not found/i);
  });
});
