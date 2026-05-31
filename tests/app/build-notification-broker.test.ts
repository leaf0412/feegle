import { describe, expect, it } from "vitest";
import { buildNotificationBroker } from "@infra/app/build-notification-broker.js";
import type { NotificationPort } from "@infra/app/notification-port.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";

describe("buildNotificationBroker", () => {
  it("lets external modules register notification adapters without editing the app entry", async () => {
    const calls: string[] = [];
    const adapter: NotificationPort = {
      sendText: async (_target, text) => {
        calls.push(text);
      },
      sendCard: async (_target, card) => {
        calls.push(String(card.elements.length));
      }
    };
    const broker = buildNotificationBroker({
      feishuClient: {} as FeishuClientPort,
      modules: [
        {
          id: "external",
          register: (target) => {
            target.register("external", adapter);
          }
        }
      ]
    });

    await broker.sendText({ platform: "external", chatId: "oc_1" }, "ok");

    expect(calls).toEqual(["ok"]);
  });

  it("freezes after build so runtime cannot register additional notification adapters", () => {
    const broker = buildNotificationBroker({ feishuClient: {} as FeishuClientPort, modules: [] });
    expect(() =>
      broker.register("late", {
        sendText: async () => {},
        sendCard: async () => {}
      })
    ).toThrow(/frozen/);
  });

  it("rejects duplicate platform adapters across modules so each platform has one adapter", () => {
    const adapter: NotificationPort = {
      sendText: async () => {},
      sendCard: async () => {}
    };
    expect(() =>
      buildNotificationBroker({
        feishuClient: {} as FeishuClientPort,
        modules: [
          { id: "first", register: (target) => target.register("dup", adapter) },
          { id: "second", register: (target) => target.register("dup", adapter) }
        ]
      })
    ).toThrow(/already registered/);
  });
});
