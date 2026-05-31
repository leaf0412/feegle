export const FEISHU_MAX_CARD_TABLES = 5;

const MARKDOWN_INDICATORS = ["```", "**", "~~", "`", "\n- ", "\n* ", "\n1. ", "\n# ", "---"];
const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const TABLE_BLOCK_RE = /(?:^\|.+\|[ \t]*\r?\n\|[\s:|-]+\|[ \t]*\r?\n(?:\|.+\|[ \t]*\r?\n?)+)/gm;

export function containsMarkdown(text: string): boolean {
  return MARKDOWN_INDICATORS.some((needle) => text.includes(needle));
}

export function hasComplexMarkdown(text: string): boolean {
  if (text.includes("```")) {
    return true;
  }
  return text.split("\n").some((line) => isTableLine(line));
}

export function countMarkdownTables(text: string): number {
  let count = 0;
  let inTable = false;
  for (const line of text.split("\n")) {
    if (isTableLine(line)) {
      if (!inTable) {
        count += 1;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }
  return count;
}

export function splitMarkdownByTables(text: string, maxTables: number): string[] {
  if (maxTables <= 0) {
    return [text];
  }
  const matches: Array<{ start: number; end: number }> = [];
  TABLE_BLOCK_RE.lastIndex = 0;
  for (const match of text.matchAll(TABLE_BLOCK_RE)) {
    if (match.index === undefined) {
      continue;
    }
    matches.push({ start: match.index, end: match.index + match[0].length });
  }
  if (matches.length <= maxTables) {
    return [text];
  }
  const parts: string[] = [];
  const firstEnd = matches[maxTables].start;
  const head = text.slice(0, firstEnd).trim();
  if (head !== "") {
    parts.push(head);
  }
  for (const match of matches.slice(maxTables)) {
    const block = text.slice(match.start, match.end).trim();
    if (block !== "") {
      parts.push(block);
    }
  }
  return parts;
}

export function isValidFeishuHref(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

export function sanitizeMarkdownURLs(text: string): string {
  return text.replace(MD_LINK_RE, (match, label: string, url: string) => {
    if (isValidFeishuHref(url)) {
      return match;
    }
    return `${label} (${url})`;
  });
}

export function preprocessFeishuMarkdown(text: string): string {
  const chars: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (
      i > 0 &&
      text[i] === "`" &&
      text[i + 1] === "`" &&
      text[i + 2] === "`" &&
      text[i - 1] !== "\n"
    ) {
      chars.push("\n");
    }
    chars.push(text[i]);
  }
  return chars.join("");
}

export interface FeishuPostSegment {
  tag: string;
  text?: string;
  href?: string;
  language?: string;
  style?: string[];
}

interface InlineMarker {
  pattern: string;
  style: string;
}

const INLINE_MARKERS: InlineMarker[] = [
  { pattern: "**", style: "bold" },
  { pattern: "~~", style: "lineThrough" },
  { pattern: "`", style: "code" },
  { pattern: "*", style: "italic" }
];

export function parseInlineMarkdown(line: string): FeishuPostSegment[] {
  const elements: FeishuPostSegment[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    const link = takeLeadingLink(remaining);
    if (link) {
      if (link.prefix !== "") {
        elements.push({ tag: "text", text: link.prefix });
      }
      elements.push({ tag: "a", text: link.label, href: link.url });
      remaining = link.rest;
      continue;
    }

    const marker = findEarliestMarker(remaining);
    if (!marker) {
      if (remaining !== "") {
        elements.push({ tag: "text", text: remaining });
      }
      break;
    }

    if (marker.openIndex > 0) {
      elements.push({ tag: "text", text: remaining.slice(0, marker.openIndex) });
    }
    const innerStart = marker.openIndex + marker.def.pattern.length;
    const closeIdx = findClosingMarker(remaining, innerStart, marker.def);
    if (closeIdx < 0) {
      elements.push({ tag: "text", text: marker.def.pattern + remaining.slice(innerStart) });
      break;
    }
    const inner = remaining.slice(innerStart, closeIdx);
    elements.push({ tag: "text", text: inner, style: [marker.def.style] });
    remaining = remaining.slice(closeIdx + marker.def.pattern.length);
  }

  return elements;
}

function findEarliestMarker(text: string): { def: InlineMarker; openIndex: number } | null {
  let best: { def: InlineMarker; openIndex: number } | null = null;
  for (const def of INLINE_MARKERS) {
    let idx = text.indexOf(def.pattern);
    if (idx < 0) {
      continue;
    }
    if (def.pattern === "*") {
      idx = findSingleAsterisk(text);
      if (idx < 0) {
        continue;
      }
    }
    if (!best || idx < best.openIndex) {
      best = { def, openIndex: idx };
    }
  }
  return best;
}

function findClosingMarker(text: string, fromIndex: number, marker: InlineMarker): number {
  if (marker.pattern === "*") {
    return findSingleAsterisk(text.slice(fromIndex), fromIndex);
  }
  return text.indexOf(marker.pattern, fromIndex);
}

function findSingleAsterisk(text: string, baseOffset = 0): number {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "*") {
      continue;
    }
    if (text[i + 1] === "*") {
      i += 1;
      continue;
    }
    return i + baseOffset;
  }
  return -1;
}

function takeLeadingLink(text: string): { prefix: string; label: string; url: string; rest: string } | null {
  const linkIdx = text.indexOf("[");
  if (linkIdx < 0) {
    return null;
  }
  const bracketClose = text.indexOf("](", linkIdx);
  if (bracketClose < 0) {
    return null;
  }
  const parenClose = text.indexOf(")", bracketClose + 2);
  if (parenClose < 0) {
    return null;
  }
  for (const def of INLINE_MARKERS) {
    const markerIdx = text.indexOf(def.pattern);
    if (markerIdx >= 0 && markerIdx < linkIdx) {
      return null;
    }
  }
  const url = text.slice(bracketClose + 2, parenClose);
  if (!isValidFeishuHref(url)) {
    return null;
  }
  return {
    prefix: text.slice(0, linkIdx),
    label: text.slice(linkIdx + 1, bracketClose),
    url,
    rest: text.slice(parenClose + 1)
  };
}

export function buildPostMdJSON(content: string): string {
  const sanitized = sanitizeMarkdownURLs(content);
  return JSON.stringify({
    zh_cn: {
      content: [[{ tag: "md", text: sanitized }]]
    }
  });
}

export function buildPostJSON(content: string): string {
  const lines = content.split("\n");
  const postLines: FeishuPostSegment[][] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = trimmed.slice(3);
        codeLines = [];
      } else {
        inCodeBlock = false;
        postLines.push([
          { tag: "code_block", language: codeLang, text: codeLines.join("\n") }
        ]);
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    let headerLine = line;
    for (let level = 6; level >= 1; level -= 1) {
      const prefix = "#".repeat(level) + " ";
      if (line.startsWith(prefix)) {
        headerLine = `**${line.slice(prefix.length)}**`;
        break;
      }
    }

    const elements = parseInlineMarkdown(headerLine);
    if (elements.length > 0) {
      postLines.push(elements);
    } else {
      postLines.push([{ tag: "text", text: "" }]);
    }
  }

  if (inCodeBlock && codeLines.length > 0) {
    postLines.push([{ tag: "code_block", language: codeLang, text: codeLines.join("\n") }]);
  }

  return JSON.stringify({
    zh_cn: {
      content: postLines
    }
  });
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 1 && trimmed.startsWith("|") && trimmed.endsWith("|");
}
