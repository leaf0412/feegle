import { describe, expect, it } from "vitest";
import { NotificationBroker } from "@infra/app/notification-broker.js";
import type { NotificationPort, NotificationTarget } from "@infra/app/notification-port.js";

describe("NotificationBroker", () => {
  it("routes messages by platform so scheduled jobs stay platform-neutral", async () => {
    const calls: string[] = [];
    const feishu: NotificationPort = {
      sendText: async (target, text) => {
        calls.push(`${target.chatId}:${text}`);
      },
      sendCard: async (target, card) => {
        calls.push(`${target.chatId}:${card.elements.length}`);
      }
    };
    const broker = new NotificationBroker({ feishu });
    const target: NotificationTarget = { platform: "feishu", chatId: "oc_1" };

    await broker.sendText(target, "任务完成");
    await broker.sendCard(target, { elements: [{ kind: "markdown", content: "ok" }] });

    expect(calls).toEqual(["oc_1:任务完成", "oc_1:1"]);
  });

  it("surfaces unregistered platforms instead of dropping notifications", async () => {
    const broker = new NotificationBroker({});

    await expect(
      broker.sendText({ platform: "feishu", chatId: "oc_1" }, "任务失败")
    ).rejects.toThrow("No notification adapter registered for platform: feishu");
  });
});
