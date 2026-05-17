import { describe, expect, it } from "vitest";
import { ChatHistoryStore } from "../../src/agent/chat-history-store.js";

describe("ChatHistoryStore", () => {
  it("returns an empty history for unknown sessions", () => {
    const store = new ChatHistoryStore();
    expect(store.get("missing")).toEqual([]);
  });

  it("appends messages and returns the running history", () => {
    const store = new ChatHistoryStore();
    store.append("sk_1", { role: "user", content: "hi" });
    store.append("sk_1", { role: "assistant", content: "hi back" });
    expect(store.get("sk_1")).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hi back" }
    ]);
  });

  it("evicts oldest messages once maxMessages is exceeded", () => {
    const store = new ChatHistoryStore({ maxMessages: 2 });
    store.append("sk_1", { role: "user", content: "one" });
    store.append("sk_1", { role: "assistant", content: "two" });
    store.append("sk_1", { role: "user", content: "three" });
    expect(store.get("sk_1")).toEqual([
      { role: "assistant", content: "two" },
      { role: "user", content: "three" }
    ]);
  });

  it("clear() removes a single session without affecting others", () => {
    const store = new ChatHistoryStore();
    store.append("sk_a", { role: "user", content: "a" });
    store.append("sk_b", { role: "user", content: "b" });
    store.clear("sk_a");
    expect(store.get("sk_a")).toEqual([]);
    expect(store.get("sk_b")).toEqual([{ role: "user", content: "b" }]);
    expect(store.sessions()).toEqual(["sk_b"]);
  });

  it("rejects non-positive maxMessages to surface configuration mistakes", () => {
    expect(() => new ChatHistoryStore({ maxMessages: 0 })).toThrow(/positive/);
  });
});
