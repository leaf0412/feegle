import { describe, expect, it } from "vitest";
import { FeishuBindPromptManager } from "@integrations/feishu/feishu-bind-prompt-manager.js";
import { buildBindPromptSupersededCard } from "@integrations/feishu/feishu-workbench-cards.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";

describe("FeishuBindPromptManager", () => {
  function trackingClient() {
    const updatesByMessage = new Map<string, string[]>();
    const client = makeFakeFeishuClient({
      async updateInteractiveCard(messageId, card) {
        const list = updatesByMessage.get(messageId) ?? [];
        list.push(JSON.stringify(card));
        updatesByMessage.set(messageId, list);
      }
    });
    return {
      client,
      /** Return space-separated update strings for a message id. */
      update: (messageId: string) => (updatesByMessage.get(messageId) ?? []).join("\n"),
      /** Return simplified update labels. */
      updates: (messageId: string) =>
        (updatesByMessage.get(messageId) ?? []).map((json) =>
          json.includes("已失效") ? "已失效" : json.includes("已取消") ? "已取消" : json
        )
    };
  }

  it("tracks add/remove lifecycle", () => {
    const mgr = new FeishuBindPromptManager(makeFakeFeishuClient());

    mgr.add("scope_1", "card_a");
    mgr.add("scope_1", "card_b");
    mgr.add("scope_2", "card_c");

    expect(mgr.getIds("scope_1")).toEqual(new Set(["card_a", "card_b"]));
    expect(mgr.getIds("scope_2")).toEqual(new Set(["card_c"]));
    expect(mgr.hasScope("scope_1")).toBe(true);
    expect(mgr.hasScope("nonexistent")).toBe(false);

    mgr.remove("scope_1", "card_a");
    expect(mgr.getIds("scope_1")).toEqual(new Set(["card_b"]));

    mgr.remove("scope_1", "card_b");
    expect(mgr.hasScope("scope_1")).toBe(false);
  });

  it("sweeps all outstanding prompts for a scope to inert state", async () => {
    const t = trackingClient();
    const mgr = new FeishuBindPromptManager(t.client);

    mgr.add("oc_g", "card_1");
    mgr.add("oc_g", "card_2");

    await mgr.sweep("oc_g");

    expect(t.update("card_1")).toContain("已失效");
    expect(t.update("card_2")).toContain("已失效");
    expect(mgr.hasScope("oc_g")).toBe(false);
  });

  it("sweep excludes the acting message from update", async () => {
    const t = trackingClient();
    const mgr = new FeishuBindPromptManager(t.client);

    mgr.add("oc_g", "card_1");
    mgr.add("oc_g", "card_2");

    await mgr.sweep("oc_g", "card_2");

    expect(t.update("card_1")).toContain("已失效");
    // card_2 was excluded — no update expected
    expect(t.update("card_2")).toBe("");
    expect(mgr.hasScope("oc_g")).toBe(false);
  });

  it("remove stops tracking a card without updating it", () => {
    const mgr = new FeishuBindPromptManager(makeFakeFeishuClient());

    mgr.add("oc_g", "card_1");
    mgr.add("oc_g", "card_2");
    mgr.remove("oc_g", "card_1");

    expect(mgr.getIds("oc_g")).toEqual(new Set(["card_2"]));
  });

  it("cancelled card is excluded from later sweep", async () => {
    const t = trackingClient();
    const mgr = new FeishuBindPromptManager(t.client);

    mgr.add("oc_g", "card_1");
    mgr.add("oc_g", "card_2");
    mgr.remove("oc_g", "card_1"); // cancelled

    await mgr.sweep("oc_g");

    expect(t.update("card_1")).toBe(""); // not swept
    expect(t.update("card_2")).toContain("已失效");
  });

  it("does nothing for an unknown scope", async () => {
    const t = trackingClient();
    const mgr = new FeishuBindPromptManager(t.client);

    await expect(mgr.sweep("nonexistent")).resolves.toBeUndefined();
  });

  it("delete-tracked scope after all cards are removed", () => {
    const mgr = new FeishuBindPromptManager(makeFakeFeishuClient());

    mgr.add("x", "a");
    mgr.add("x", "b");
    mgr.remove("x", "a");
    mgr.remove("x", "b");

    expect(mgr.hasScope("x")).toBe(false);
  });

  it("produces a valid superseded card schema", async () => {
    const updatedCards: unknown[] = [];
    const client = makeFakeFeishuClient({
      async updateInteractiveCard(_messageId, card) {
        updatedCards.push(card);
      }
    });
    const mgr = new FeishuBindPromptManager(client);

    mgr.add("s", "card_1");
    await mgr.sweep("s");

    expect(updatedCards).toHaveLength(1);
    const card = updatedCards[0] as Record<string, unknown>;
    expect(card.schema).toBe("2.0");
    expect(JSON.stringify(card)).toContain("已失效");
  });
});
