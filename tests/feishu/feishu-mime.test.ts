import { describe, expect, it } from "vitest";
import {
  buildCardJSON,
  buildReplyContent,
  detectFeishuFileType,
  detectMimeType,
  predictMsgType
} from "@integrations/feishu/feishu-mime.js";

describe("detectMimeType", () => {
  it("sniffs PNG / JPEG / GIF / WEBP magic bytes", () => {
    expect(detectMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(detectMimeType(new Uint8Array([0xff, 0xd8, 0, 0]))).toBe("image/jpeg");
    expect(detectMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe("image/gif");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(detectMimeType(webp)).toBe("image/webp");
  });

  it("sniffs PDF / MP3 / OGG", () => {
    expect(detectMimeType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
    expect(detectMimeType(new Uint8Array([0x49, 0x44, 0x33, 0x04]))).toBe("audio/mpeg");
    expect(detectMimeType(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe("audio/ogg");
  });

  it("returns undefined when no magic bytes match", () => {
    expect(detectMimeType(new Uint8Array([0x01, 0x02, 0x03, 0x04]))).toBeUndefined();
  });
});

describe("detectFeishuFileType", () => {
  it("maps known extensions to Feishu file_type buckets", () => {
    expect(detectFeishuFileType(undefined, "report.pdf")).toBe("pdf");
    expect(detectFeishuFileType(undefined, "notes.docx")).toBe("doc");
    expect(detectFeishuFileType(undefined, "data.csv")).toBe("xls");
    expect(detectFeishuFileType(undefined, "deck.pptx")).toBe("ppt");
    expect(detectFeishuFileType(undefined, "clip.MP4")).toBe("mp4");
    expect(detectFeishuFileType(undefined, "voice.opus")).toBe("opus");
  });

  it("falls back to the generic stream bucket when nothing matches", () => {
    expect(detectFeishuFileType(undefined, "random.bin")).toBe("stream");
  });

  it("uses mime type as an override when filename has no extension", () => {
    expect(detectFeishuFileType("application/pdf", "blob")).toBe("pdf");
    expect(detectFeishuFileType("audio/opus", "blob")).toBe("opus");
  });
});

describe("predictMsgType", () => {
  it("returns text for plain content", () => {
    expect(predictMsgType("hello")).toBe("text");
  });

  it("returns interactive when content is markdown with <= 5 tables", () => {
    expect(predictMsgType("hello **world**")).toBe("interactive");
  });

  it("falls back to post when more than 5 tables would exceed card limit", () => {
    const tables = Array.from({ length: 6 }, (_, idx) => `| h${idx} |\n|---|\n| ${idx} |`).join("\n\n");
    expect(predictMsgType(tables)).toBe("post");
  });
});

describe("buildReplyContent", () => {
  it("emits a text payload for plain content", () => {
    expect(buildReplyContent("hi")).toEqual({ msgType: "text", body: JSON.stringify({ text: "hi" }) });
  });

  it("emits an interactive card body for moderate markdown", () => {
    const payload = buildReplyContent("hello **world**");
    expect(payload.msgType).toBe("interactive");
    const body = JSON.parse(payload.body) as { body: { elements: Array<{ tag: string; content: string }> } };
    expect(body.body.elements[0]).toMatchObject({ tag: "markdown" });
    expect(body.body.elements[0].content).toContain("**world**");
  });

  it("emits a post payload when card table limit is exceeded", () => {
    const tables = Array.from({ length: 6 }, (_, idx) => `| h${idx} |\n|---|\n| ${idx} |`).join("\n\n");
    expect(buildReplyContent(tables).msgType).toBe("post");
  });
});

describe("buildCardJSON", () => {
  it("wraps content in a schema 2.0 card with single markdown element", () => {
    const card = JSON.parse(buildCardJSON("hi")) as {
      schema: string;
      body: { elements: Array<Record<string, unknown>> };
    };
    expect(card.schema).toBe("2.0");
    expect(card.body.elements).toEqual([{ tag: "markdown", content: "hi" }]);
  });
});
