import { describe, expect, it } from "vitest";
import { createPlatformCard } from "@platform/platform-card.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { FeishuNotificationAdapter } from "@integrations/feishu/feishu-notification-adapter.js";

describe("FeishuNotificationAdapter", () => {
  it("sends text and rendered cards through the Feishu client without business logic", async () => {
    const calls: unknown[] = [];
    const client = {
      sendText: async (chatId: string, text: string) => {
        calls.push(["text", chatId, text]);
      },
      sendInteractiveCard: async (chatId: string, card: unknown) => {
        calls.push(["card", chatId, card]);
      }
    } as FeishuClientPort;
    const adapter = new FeishuNotificationAdapter(client);

    await adapter.sendText({ platform: "feishu", chatId: "oc_1" }, "hello");
    await adapter.sendCard(
      { platform: "feishu", chatId: "oc_1" },
      createPlatformCard().title("调度结果", "green").markdown("完成").build()
    );

    expect(calls[0]).toEqual(["text", "oc_1", "hello"]);
    expect(JSON.stringify(calls[1])).toContain("调度结果");
    expect(JSON.stringify(calls[1])).toContain("完成");
  });
});
