import { describe, expect, it } from "vitest";
import { LarkFeishuClient, type FeishuClientPort } from "../../src/feishu/feishu-client.js";

describe("LarkFeishuClient", () => {
  it("sends text messages to chat ids", async () => {
    const calls: unknown[] = [];
    const client: FeishuClientPort = new LarkFeishuClient({
      im: {
        message: {
          create: async (input: unknown) => {
            calls.push(input);
          }
        }
      }
    });

    await client.sendText("oc_1", "hello");

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
        message: {
          create: async (input: unknown) => {
            calls.push(input);
          }
        }
      }
    });
    const card = { elements: [], header: { title: { tag: "plain_text", content: "Push" } } };

    await client.sendInteractiveCard("oc_1", card);

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
});
