import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { LarkFeishuClient, type FeishuClientPort } from "../../src/integrations/feishu/feishu-client.js";

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

  it("uploads an image buffer and sends an image message", async () => {
    const calls: unknown[] = [];
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const client = new LarkFeishuClient({
      im: {
        v1: {
          image: {
            create: async (input) => {
              calls.push(input);
              return { data: { image_key: "img_v3_1" } };
            }
          },
          message: {
            create: async (input) => {
              calls.push(input);
              return { data: { message_id: "om_image" } };
            },
            patch: async () => ({})
          }
        }
      }
    });

    await expect(client.sendImage("oc_1", image)).resolves.toBe("om_image");
    expect(calls).toEqual([
      { data: { image_type: "message", image } },
      {
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: "oc_1",
          msg_type: "image",
          content: JSON.stringify({ image_key: "img_v3_1" })
        }
      }
    ]);
  });

  it("uploads an opus audio buffer and sends an audio message", async () => {
    const calls: unknown[] = [];
    const audio = Buffer.from([0x4f, 0x67, 0x67, 0x53]);
    const client = new LarkFeishuClient({
      im: {
        v1: {
          file: {
            create: async (input) => {
              calls.push(input);
              return { data: { file_key: "file_audio_1" } };
            }
          },
          message: {
            create: async (input) => {
              calls.push(input);
              return { data: { message_id: "om_audio" } };
            },
            patch: async () => ({})
          }
        }
      }
    });

    await expect(client.sendAudio("oc_1", audio)).resolves.toBe("om_audio");
    expect(calls[0]).toEqual({
      data: { file_name: "tts_audio.opus", file_type: "opus", file: audio }
    });
    expect(calls[1]).toEqual({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: "oc_1",
        msg_type: "audio",
        content: JSON.stringify({ file_key: "file_audio_1" })
      }
    });
  });

  it("refuses non-opus audio so callers convert before sending", async () => {
    const client = new LarkFeishuClient({
      im: {
        v1: {
          file: { create: async () => ({ data: { file_key: "ignored" } }) },
          message: {
            create: async () => ({ data: { message_id: "ignored" } }),
            patch: async () => ({})
          }
        }
      }
    });
    await expect(
      client.sendAudio("oc_1", Buffer.from([]), { format: "wav" as unknown as "opus" })
    ).rejects.toThrow(/only accepts opus/);
  });

  it("downloads message resources via the readable stream API and sniffs MIME for images", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const client = new LarkFeishuClient({
      im: {
        v1: {
          messageResource: {
            get: async () => ({ getReadableStream: () => Readable.from([png]) })
          },
          message: {
            create: async () => ({ data: { message_id: "ignored" } }),
            patch: async () => ({})
          }
        }
      }
    });

    await expect(client.downloadResource("om_1", "img_key", "image")).resolves.toEqual(png);
    await expect(client.downloadImage("om_1", "img_key")).resolves.toEqual({
      data: png,
      mimeType: "image/png"
    });
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
