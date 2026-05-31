import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, type RuntimeDb } from "@infra/app/runtime-db.js";
import { SessionStore } from "../../src/agent/session-store.js";

let db: RuntimeDb;
let clock: { current: Date };

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  clock = { current: new Date("2026-05-19T10:00:00.000Z") };
});

afterEach(() => {
  db.close();
});

function makeClock() {
  return () => clock.current;
}

describe("SessionStore", () => {
  it("returns an empty list on a fresh DB so feegle does not crash on a clean home", () => {
    const store = new SessionStore(db, { clock: makeClock() });
    expect(store.list()).toEqual([]);
  });

  it("getOrCreate returns existing session so reopening a chat does not duplicate state", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    const first = await store.getOrCreate("feishu:oc_a:root:m_1", { agentKind: "claude_code" });
    const second = await store.getOrCreate("feishu:oc_a:root:m_1", { agentKind: "codex" });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.agentKind).toBe("claude_code");
    expect(store.list()).toHaveLength(1);
  });

  it("touch updates lastActiveAt so /list ordering can reflect recency", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    const initial = await store.getOrCreate("feishu:oc_a:root:m_1");
    clock.current = new Date("2026-05-19T11:00:00.000Z");
    const touched = await store.touch("feishu:oc_a:root:m_1");
    expect(touched.lastActiveAt).toBe("2026-05-19T11:00:00.000Z");
    expect(touched.createdAt).toBe(initial.createdAt);
  });

  it("rename rejects empty names so a /name with no args cannot silently wipe a label", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1");
    await expect(store.rename("feishu:oc_a:root:m_1", "   ")).rejects.toThrow(/empty/);
  });

  it("close marks status closed so /switch can be implemented as close+touch", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1");
    const closed = await store.close("feishu:oc_a:root:m_1");
    expect(closed.status).toBe("closed");
  });

  it("remove returns false when sessionKey is unknown so callers can render 'not found' messages safely", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    expect(await store.remove("feishu:oc_a:root:m_1")).toBe(false);
  });

  it("persists across store instances on the same DB so SessionStore survives bot restarts", async () => {
    const writer = new SessionStore(db, { clock: makeClock() });
    await writer.getOrCreate("feishu:oc_a:root:m_1", { name: "alpha" });
    // Construct a brand-new store on the same DB — simulates the next boot
    // re-attaching prepared statements to a populated table.
    const reader = new SessionStore(db, { clock: makeClock() });
    expect(reader.get("feishu:oc_a:root:m_1")?.name).toBe("alpha");
  });

  it("listByPrefix scopes sessions to a chat so /list per group does not leak other chats", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1");
    await store.getOrCreate("feishu:oc_a:root:m_2");
    await store.getOrCreate("feishu:oc_b:root:m_3");
    const scoped = store.listByPrefix("feishu:oc_a:");
    expect(scoped.map((s) => s.sessionKey).sort()).toEqual([
      "feishu:oc_a:root:m_1",
      "feishu:oc_a:root:m_2"
    ]);
  });

  it("listByPrefix escapes LIKE wildcards so a `%` in the prefix doesn't match unrelated keys", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    // A real prefix containing `%` should match literally, not as a wildcard.
    await store.getOrCreate("feishu:oc_a%special:m_1");
    await store.getOrCreate("feishu:oc_aZspecial:m_2"); // would match if `%` was wildcard
    const scoped = store.listByPrefix("feishu:oc_a%");
    expect(scoped.map((s) => s.sessionKey)).toEqual(["feishu:oc_a%special:m_1"]);
  });

  it("assignAgent creates a session pinned to the chosen agent when none exists", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    const record = await store.assignAgent("feishu:oc_a:root:m_1", "codex");
    expect(record.agentKind).toBe("codex");
    expect(store.get("feishu:oc_a:root:m_1")?.agentKind).toBe("codex");
  });

  it("assignAgent re-pins an existing session so a removed agent can be replaced", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    await store.getOrCreate("feishu:oc_a:root:m_1", { agentKind: "claude_code" });
    const record = await store.assignAgent("feishu:oc_a:root:m_1", "codex");
    expect(record.agentKind).toBe("codex");
    expect(store.list()).toHaveLength(1);
  });

  it("setQuiet round-trips boolean ↔ integer so quiet mode persists across queries", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    await store.getOrCreate("k");
    // Default omitted (legacy JSON shape).
    expect(store.get("k")?.quiet).toBeUndefined();
    const enabled = await store.setQuiet("k", true);
    expect(enabled.quiet).toBe(true);
    expect(store.get("k")?.quiet).toBe(true);
    const disabled = await store.setQuiet("k", false);
    // false collapses back to undefined to match the legacy "omit when false" shape.
    expect(disabled.quiet).toBeUndefined();
    expect(store.get("k")?.quiet).toBeUndefined();
  });

  it("reopen flips a closed session back to active so /switch can resume it", async () => {
    const store = new SessionStore(db, { clock: makeClock() });
    await store.getOrCreate("k");
    await store.close("k");
    expect(store.get("k")?.status).toBe("closed");
    const reopened = await store.reopen("k");
    expect(reopened.status).toBe("active");
  });
});
