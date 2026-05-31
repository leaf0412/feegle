import { describe, expect, it, vi } from "vitest";
import type { FeishuMergeForwardItem } from "../../src/integrations/feishu/feishu-client.js";
import { parseMergeForward } from "../../src/integrations/feishu/feishu-merge-forward.js";
import { FeishuUserDirectory } from "../../src/integrations/feishu/feishu-user-directory.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";

describe("parseMergeForward", () => {
  it("returns empty result when there are no sub-messages", async () => {
    const client = makeFakeFeishuClient({ fetchMergeForwardItems: vi.fn().mockResolvedValue([]) });
    const directory = new FeishuUserDirectory(client);
    await expect(parseMergeForward(client, directory, "om_root")).resolves.toEqual({
      text: "",
      images: [],
      files: []
    });
  });

  it("formats text + image + file sub-messages with indentation and collects attachments", async () => {
    const items: FeishuMergeForwardItem[] = [
      {
        messageId: "om_text",
        messageType: "text",
        upperMessageId: "om_root",
        senderId: "ou_alice",
        senderType: "user",
        createTimeMs: Date.UTC(2026, 4, 17, 12, 0, 0),
        content: JSON.stringify({ text: "hello" }),
        mentions: []
      },
      {
        messageId: "om_image",
        messageType: "image",
        upperMessageId: "om_root",
        senderId: "ou_alice",
        senderType: "user",
        createTimeMs: Date.UTC(2026, 4, 17, 12, 1, 0),
        content: JSON.stringify({ image_key: "img_key" }),
        mentions: []
      },
      {
        messageId: "om_file",
        messageType: "file",
        upperMessageId: "om_root",
        senderId: "ou_alice",
        senderType: "user",
        createTimeMs: Date.UTC(2026, 4, 17, 12, 2, 0),
        content: JSON.stringify({ file_key: "file_key", file_name: "notes.txt" }),
        mentions: []
      }
    ];
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fileBytes = Buffer.from("notes");
    const client = makeFakeFeishuClient({
      fetchMergeForwardItems: vi.fn().mockResolvedValue(items),
      fetchUserName: vi.fn().mockResolvedValue("Alice"),
      downloadImage: vi.fn().mockResolvedValue({ data: imageBytes, mimeType: "image/png" }),
      downloadResource: vi.fn().mockResolvedValue(fileBytes)
    });
    const directory = new FeishuUserDirectory(client);
    const result = await parseMergeForward(client, directory, "om_root");
    expect(result.images).toEqual([{ mimeType: "image/png", data: imageBytes }]);
    expect(result.files).toEqual([{ mimeType: undefined, fileName: "notes.txt", data: fileBytes }]);
    expect(result.text).toContain("<forwarded_messages>");
    expect(result.text).toContain("Alice:\n    hello");
    expect(result.text).toContain("Alice: [image]");
    expect(result.text).toContain("Alice: [file: notes.txt]");
    expect(result.text).toContain("</forwarded_messages>");
  });

  it("recurses into nested merge_forward children with increased indentation", async () => {
    const items: FeishuMergeForwardItem[] = [
      {
        messageId: "om_outer",
        messageType: "merge_forward",
        upperMessageId: "om_root",
        senderId: "ou_alice",
        senderType: "user",
        createTimeMs: 1_700_000_000_000,
        content: "",
        mentions: []
      },
      {
        messageId: "om_inner",
        messageType: "text",
        upperMessageId: "om_outer",
        senderId: "ou_alice",
        senderType: "user",
        createTimeMs: 1_700_000_001_000,
        content: JSON.stringify({ text: "inner" }),
        mentions: []
      }
    ];
    const client = makeFakeFeishuClient({
      fetchMergeForwardItems: vi.fn().mockResolvedValue(items),
      fetchUserName: vi.fn().mockResolvedValue("Alice")
    });
    const directory = new FeishuUserDirectory(client);
    const result = await parseMergeForward(client, directory, "om_root");
    expect(result.text).toMatch(/Alice: \[forwarded messages\]/);
    expect(result.text).toMatch(/\n {4}\[.*?\] Alice:\n {8}inner/);
  });

  it("falls back to a placeholder line when an attachment download fails", async () => {
    const items: FeishuMergeForwardItem[] = [
      {
        messageId: "om_image",
        messageType: "image",
        upperMessageId: "om_root",
        senderId: "ou_alice",
        senderType: "user",
        createTimeMs: 1_700_000_000_000,
        content: JSON.stringify({ image_key: "img_key" }),
        mentions: []
      }
    ];
    const client = makeFakeFeishuClient({
      fetchMergeForwardItems: vi.fn().mockResolvedValue(items),
      fetchUserName: vi.fn().mockResolvedValue("Alice"),
      downloadImage: vi.fn().mockResolvedValue(undefined)
    });
    const directory = new FeishuUserDirectory(client);
    const result = await parseMergeForward(client, directory, "om_root");
    expect(result.images).toEqual([]);
    expect(result.text).toMatch(/Alice: \[image - download failed\]/);
  });
});

