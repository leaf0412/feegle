import type { FeishuClientPort, FeishuMergeForwardItem } from "./feishu-client.js";
import {
  extractPostPlainText,
  replaceMentions
} from "./feishu-content-extractor.js";
import { detectMimeType } from "./feishu-mime.js";
import type { FeishuUserDirectory } from "./feishu-user-directory.js";

const MAX_NESTING_DEPTH = 10;

export interface MergeForwardImage {
  mimeType?: string;
  data: Buffer;
}

export interface MergeForwardFile {
  mimeType?: string;
  fileName: string;
  data: Buffer;
}

export interface MergeForwardResult {
  text: string;
  images: MergeForwardImage[];
  files: MergeForwardFile[];
}

export async function parseMergeForward(
  client: FeishuClientPort,
  directory: FeishuUserDirectory,
  rootMessageId: string
): Promise<MergeForwardResult> {
  const items = await client.fetchMergeForwardItems(rootMessageId);
  if (items.length === 0) {
    return { text: "", images: [], files: [] };
  }

  const childrenMap = new Map<string, FeishuMergeForwardItem[]>();
  const senderIds = new Set<string>();
  for (const item of items) {
    if (item.messageId === rootMessageId) {
      continue;
    }
    const parentId = item.upperMessageId === undefined || item.upperMessageId === "" ? rootMessageId : item.upperMessageId;
    const bucket = childrenMap.get(parentId) ?? [];
    bucket.push(item);
    childrenMap.set(parentId, bucket);
    if (item.senderId && item.senderType !== "app") {
      senderIds.add(item.senderId);
    }
  }

  const nameMap = await directory.resolveUserNames(Array.from(senderIds));
  const images: MergeForwardImage[] = [];
  const files: MergeForwardFile[] = [];
  const lines: string[] = ["<forwarded_messages>"];
  await formatTree(client, rootMessageId, childrenMap, nameMap, lines, images, files, 0);
  lines.push("</forwarded_messages>");
  return { text: lines.join("\n"), images, files };
}

async function formatTree(
  client: FeishuClientPort,
  parentId: string,
  childrenMap: ReadonlyMap<string, FeishuMergeForwardItem[]>,
  nameMap: ReadonlyMap<string, string>,
  lines: string[],
  images: MergeForwardImage[],
  files: MergeForwardFile[],
  depth: number
): Promise<void> {
  const indent = "    ".repeat(depth);
  if (depth > MAX_NESTING_DEPTH) {
    lines.push(`${indent}[nested forwarding truncated]`);
    return;
  }
  const children = childrenMap.get(parentId) ?? [];
  for (const item of children) {
    const senderName = item.senderId ? nameMap.get(item.senderId) ?? item.senderId : "unknown";
    const timestamp = formatTimestamp(item.createTimeMs);
    const header = `${indent}[${timestamp}] ${senderName}:`;
    const content = item.content ?? "";
    switch (item.messageType) {
      case "text": {
        const text = extractTextBody(content);
        if (text === "") {
          continue;
        }
        lines.push(header);
        for (const line of replaceMentions(text, item.mentions).split("\n")) {
          lines.push(`${indent}    ${line}`);
        }
        break;
      }
      case "post": {
        const text = replaceMentions(extractPostPlainText(content), item.mentions);
        if (text === "") {
          continue;
        }
        lines.push(header);
        for (const line of text.split("\n")) {
          lines.push(`${indent}    ${line}`);
        }
        break;
      }
      case "image": {
        const imageKey = extractStringField(content, "image_key");
        if (!imageKey) {
          continue;
        }
        const downloaded = await client.downloadImage(item.messageId, imageKey);
        if (downloaded) {
          images.push({ mimeType: downloaded.mimeType, data: downloaded.data });
          lines.push(`${indent}[${timestamp}] ${senderName}: [image]`);
        } else {
          lines.push(`${indent}[${timestamp}] ${senderName}: [image - download failed]`);
        }
        break;
      }
      case "file": {
        const fileKey = extractStringField(content, "file_key");
        const fileName = extractStringField(content, "file_name") ?? "attachment";
        if (!fileKey) {
          continue;
        }
        const data = await client.downloadResource(item.messageId, fileKey, "file");
        if (data) {
          files.push({ mimeType: detectMimeType(data), fileName, data });
          lines.push(`${indent}[${timestamp}] ${senderName}: [file: ${fileName}]`);
        } else {
          lines.push(`${indent}[${timestamp}] ${senderName}: [file: ${fileName} - download failed]`);
        }
        break;
      }
      case "merge_forward": {
        lines.push(`${indent}[${timestamp}] ${senderName}: [forwarded messages]`);
        await formatTree(client, item.messageId, childrenMap, nameMap, lines, images, files, depth + 1);
        break;
      }
      default: {
        lines.push(`${indent}[${timestamp}] ${senderName}: [${item.messageType} message]`);
        break;
      }
    }
  }
}

function extractTextBody(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const text = (parsed as { text?: unknown }).text;
      if (typeof text === "string") {
        return text;
      }
    }
  } catch {
    return "";
  }
  return "";
}

function extractStringField(content: string, key: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value !== "") {
        return value;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function formatTimestamp(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) {
    return "";
  }
  const date = new Date(ms);
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
