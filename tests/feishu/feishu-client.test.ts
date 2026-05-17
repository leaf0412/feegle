import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("replies to the original message with text and cards", async () => {
    const calls: unknown[] = [];
    const client = new LarkFeishuClient({
      im: {
        v1: {
          message: {
            create: async () => ({ data: { message_id: "unused" } }),
            patch: async () => ({}),
            reply: async (input: unknown) => {
              calls.push(input);
              return { data: { message_id: "om_reply" } };
            }
          }
        }
      }
    });

    await expect(client.replyText("om_trigger", "收到")).resolves.toBe("om_reply");
    await expect(client.replyInteractiveCard("om_trigger", { elements: [] })).resolves.toBe("om_reply");

    expect(calls).toEqual([
      {
        path: { message_id: "om_trigger" },
        data: {
          msg_type: "text",
          content: JSON.stringify({ text: "收到" })
        }
      },
      {
        path: { message_id: "om_trigger" },
        data: {
          msg_type: "interactive",
          content: JSON.stringify({ elements: [] })
        }
      }
    ]);
  });

  it("adds and removes message reactions", async () => {
    const calls: unknown[] = [];
    const client = new LarkFeishuClient({
      im: {
        v1: {
          messageReaction: {
            create: async (input: unknown) => {
              calls.push(input);
              return { data: { reaction_id: "reaction_1" } };
            },
            delete: async (input: unknown) => {
              calls.push(input);
              return {};
            }
          },
          message: {
            create: async () => ({ data: { message_id: "unused" } }),
            patch: async () => ({})
          }
        }
      }
    });

    await expect(client.addReaction("om_1", "OnIt")).resolves.toBe("reaction_1");
    await client.removeReaction("om_1", "reaction_1");

    expect(calls).toEqual([
      {
        path: { message_id: "om_1" },
        data: { reaction_type: { emoji_type: "OnIt" } }
      },
      {
        path: { message_id: "om_1", reaction_id: "reaction_1" }
      }
    ]);
  });

  it("updates progress cards in place", async () => {
    const calls: unknown[] = [];
    const client = new LarkFeishuClient({
      im: {
        v1: {
          message: {
            create: async () => {
              throw new Error("create should not be called");
            },
            patch: async (input: unknown) => {
              calls.push(input);
              return {};
            }
          }
        }
      }
    });

    await client.updateProgress("om_1", {
      title: "Codex",
      state: "completed",
      truncated: false,
      entries: [{ kind: "info", text: "完成" }]
    });

    expect(JSON.stringify(calls[0])).toContain("Codex · 已完成");
  });

  it("resolves the bot open_id via the bot info endpoint and caches the result", async () => {
    const calls: unknown[] = [];
    const client: FeishuClientPort = new LarkFeishuClient({
      request: async (payload) => {
        calls.push(payload);
        return { code: 0, bot: { open_id: "ou_bot" } };
      },
      im: {
        v1: {
          message: {
            create: async () => ({ data: { message_id: "x" } }),
            patch: async () => ({})
          }
        }
      }
    });

    await expect(client.fetchBotOpenId()).resolves.toBe("ou_bot");
    await expect(client.fetchBotOpenId()).resolves.toBe("ou_bot");
    expect(calls).toEqual([{ url: "/open-apis/bot/v3/info", method: "GET" }]);
  });

  it("throws when the bot info response has no open_id", async () => {
    const client = new LarkFeishuClient({
      request: async () => ({ code: 0, bot: {} }),
      im: {
        v1: {
          message: {
            create: async () => ({ data: { message_id: "x" } }),
            patch: async () => ({})
          }
        }
      }
    });
    await expect(client.fetchBotOpenId()).rejects.toThrow(/missing open_id/);
  });

  it("uploads a local file and sends it to chat ids", async () => {
    const calls: unknown[] = [];
    const directory = await mkdtemp(join(tmpdir(), "feegle-feishu-file-"));
    const filePath = join(directory, "report.txt");
    await writeFile(filePath, "report");
    const client: FeishuClientPort = new LarkFeishuClient({
      im: {
        v1: {
          file: {
            create: async (input: unknown) => {
              calls.push(input);
              return { data: { file_key: "file_v3_1" } };
            }
          },
          message: {
            create: async (input: unknown) => {
              calls.push(input);
              return { data: { message_id: "om_file" } };
            },
            patch: async () => ({})
          }
        }
      }
    });

    await expect(client.sendFile("oc_1", filePath)).resolves.toBe("om_file");

    expect(calls).toEqual([
      {
        data: {
          file_name: "report.txt",
          file_type: "stream",
          file: expect.any(Object)
        }
      },
      {
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: "oc_1",
          msg_type: "file",
          content: JSON.stringify({ file_key: "file_v3_1" })
        }
      }
    ]);
  });
});
