import {
  buildPostMdJSON,
  containsMarkdown,
  countMarkdownTables,
  FEISHU_MAX_CARD_TABLES,
  preprocessFeishuMarkdown,
  sanitizeMarkdownURLs
} from "./feishu-markdown.js";

export type FeishuMsgType = "text" | "post" | "interactive";
export type FeishuFileType = "pdf" | "doc" | "xls" | "ppt" | "mp4" | "opus" | "stream";

export function detectMimeType(data: Uint8Array): string | undefined {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) {
    return "image/jpeg";
  }
  if (data.length >= 4 && asciiEquals(data, 0, "GIF8")) {
    return "image/gif";
  }
  if (data.length >= 12 && asciiEquals(data, 0, "RIFF") && asciiEquals(data, 8, "WEBP")) {
    return "image/webp";
  }
  if (data.length >= 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46) {
    return "application/pdf";
  }
  if (data.length >= 3 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    return "audio/mpeg";
  }
  if (data.length >= 4 && asciiEquals(data, 0, "OggS")) {
    return "audio/ogg";
  }
  return undefined;
}

export function detectFeishuFileType(mimeType: string | undefined, fileName: string): FeishuFileType {
  const name = fileName.toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  if (name.endsWith(".doc") || name.endsWith(".docx")) {
    return "doc";
  }
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) {
    return "xls";
  }
  if (name.endsWith(".ppt") || name.endsWith(".pptx")) {
    return "ppt";
  }
  if (mimeType === "video/mp4" || name.endsWith(".mp4")) {
    return "mp4";
  }
  if (mimeType === "audio/ogg" || mimeType === "audio/opus" || name.endsWith(".opus")) {
    return "opus";
  }
  return "stream";
}

export function predictMsgType(content: string): FeishuMsgType {
  if (!containsMarkdown(content)) {
    return "text";
  }
  if (countMarkdownTables(content) <= FEISHU_MAX_CARD_TABLES) {
    return "interactive";
  }
  return "post";
}

export interface FeishuReplyPayload {
  msgType: FeishuMsgType;
  body: string;
}

export function buildReplyContent(content: string): FeishuReplyPayload {
  if (!containsMarkdown(content)) {
    return { msgType: "text", body: JSON.stringify({ text: content }) };
  }
  if (countMarkdownTables(content) > FEISHU_MAX_CARD_TABLES) {
    return { msgType: "post", body: buildPostMdJSON(content) };
  }
  return { msgType: "interactive", body: buildCardJSON(sanitizeMarkdownURLs(preprocessFeishuMarkdown(content))) };
}

export function buildCardJSON(content: string): string {
  return JSON.stringify({
    schema: "2.0",
    config: { wide_screen_mode: true },
    body: {
      elements: [{ tag: "markdown", content }]
    }
  });
}

function asciiEquals(data: Uint8Array, offset: number, ascii: string): boolean {
  for (let i = 0; i < ascii.length; i += 1) {
    if (data[offset + i] !== ascii.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}
