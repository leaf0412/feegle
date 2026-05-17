import { describe, expect, it } from "vitest";
import { LarkFeishuClient, type FeishuClientPort } from "../../src/feishu/feishu-client.js";

describe("LarkFeishuClient", () => {
  it("sends text messages to chat ids", async () => {
    const calls: unknown[] = [];
    const client: FeishuClientPort = new LarkFeishuClient({
      im: {
        v1: {
          message: {
            create: async (input: unknown) => {
              calls.push(input);
              return { data: { message_id: "om_1" } };
            },
            patch: async () => ({})
          }
        }
      }
    });

    await expect(client.sendText("oc_1", "hello")).resolves.toBe("om_1");

    expect(calls).toEqual([
      {
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: "oc_1",
          msg_type: "text",
          content: JSON.stringify({ text: "hello" })
        }
      }
    ]);
  });

  it("sends interactive cards to chat ids", async () => {
    const calls: unknown[] = [];
    const client = new LarkFeishuClient({
      im: {
        v1: {
          message: {
            create: async (input: unknown) => {
              calls.push(input);
              return { data: { message_id: "om_card" } };
            },
            patch: async () => ({})
          }
        }
      }
    });
    const card = { elements: [], header: { title: { tag: "plain_text", content: "Push" } } };

    await expect(client.sendInteractiveCard("oc_1", card)).resolves.toBe("om_card");

    expect(calls).toEqual([
      {
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: "oc_1",
          msg_type: "interactive",
          content: JSON.stringify(card)
        }
      }
    ]);
  });

  it("updates interactive cards in place", async () => {
    const calls: unknown[] = [];
    const client = new LarkFeishuClient({
      im: {
        v1: {
          message: {
            create: async (input: unknown) => {
              calls.push(input);
              return { data: { message_id: "unused" } };
            },
            patch: async (input: unknown) => {
              calls.push(input);
              return {};
            }
          }
        }
      }
    });
    const card = {
      config: { update_multi: true },
      header: { title: { tag: "plain_text", content: "Running" } },
      elements: []
    };

    await client.updateInteractiveCard("om_1", card);

    expect(calls).toEqual([
      {
        path: { message_id: "om_1" },
        data: {
          content: JSON.stringify(card)
        }
      }
    ]);
  });
});
