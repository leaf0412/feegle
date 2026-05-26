import { preprocessFeishuMarkdown } from "./feishu-markdown.js";
import { getToolIcon, pickThinkingVerb } from "./feishu-tool-icons.js";
import type { PlatformProgressToolStep } from "../platform/progress.js";

export type FeishuRichCardStatus = "working" | "thinking" | "done" | "error";

export interface BuildRichCardInput {
  status: FeishuRichCardStatus;
  steps: ReadonlyArray<PlatformProgressToolStep>;
  markdown: string;
  streaming: boolean;
  elapsedMs?: number;
  thinkingVerbSec?: number;
}

const MAX_PANEL_STEPS = 30;
const MAX_CARD_JSON_BYTES = 28_000;

// Per-chunk content budget when an answer must be spread across several cards.
// Sits well below MAX_CARD_JSON_BYTES so card structure, the panel on the first
// card, markdown preprocessing growth, and JSON escaping all stay within limit.
const SPLIT_CONTENT_BUDGET_BYTES = 20_000;
const CODE_FENCE_CLOSE = "\n```";

export function isCardJSON(content: string): boolean {
  if (content.length < 10 || content[0] !== "{") {
    return false;
  }
  return content.includes('"schema"') && content.includes('"body"');
}

export function buildCardJSONWithStatus(content: string, status: FeishuRichCardStatus): string {
  return JSON.stringify({
    schema: "2.0",
    config: { wide_screen_mode: true },
    header: {
      template: headerTemplate(status),
      title: { tag: "plain_text", content: "" }
    },
    body: {
      elements: [{ tag: "markdown", content }]
    }
  });
}

export function formatElapsedCN(ms: number): string {
  const safe = ms < 0 ? 0 : ms;
  const totalSec = Math.floor(safe / 1000);
  if (safe < 60_000) {
    return `${(safe / 1000).toFixed(1)} 秒`;
  }
  if (safe < 3_600_000) {
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒`;
  }
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  return `${hours} 小时 ${minutes.toString().padStart(2, "0")} 分`;
}

export function buildRichCard(input: BuildRichCardInput): string {
  const card = {
    schema: "2.0",
    config: {
      streaming_mode: input.streaming,
      update_multi: true,
      enable_forward_interaction: true
    },
    header: {
      template: headerTemplate(input.status),
      title: { tag: "plain_text", content: headerTitle(input.status, input.thinkingVerbSec) }
    },
    body: {
      elements: buildBodyElements(input)
    }
  };
  const serialized = JSON.stringify(card);
  if (Buffer.byteLength(serialized, "utf8") > MAX_CARD_JSON_BYTES) {
    throw new Error(
      `Feishu rich card exceeds ${MAX_CARD_JSON_BYTES} bytes; split the markdown or trim tool steps before rendering`
    );
  }
  return serialized;
}

/**
 * Render a finished answer as one or more cards.
 *
 * The common path is a single card (identical to `buildRichCard`). Only when
 * that card overflows the 28KB Feishu limit do we split: the answer markdown is
 * chunked on code-fence-aware byte boundaries, the first chunk shares the card
 * with the tool-steps panel, and each remaining chunk becomes a panel-less
 * continuation card marked `（续 n/N）`. No answer content is ever dropped.
 */
export function buildRichCards(input: BuildRichCardInput): string[] {
  try {
    return [buildRichCard(input)];
  } catch {
    // Overflow — fall through and split the answer across cards.
  }

  const chunks = splitMarkdownByByteBudget(input.markdown, SPLIT_CONTENT_BUDGET_BYTES);
  const total = chunks.length;
  return chunks.map((chunk, index) => {
    if (index === 0) {
      return buildFirstSplitCard({ ...input, markdown: chunk, streaming: false });
    }
    const content = `（续 ${index + 1}/${total}）\n\n${chunk}`;
    return buildRichCard({
      status: input.status,
      steps: [],
      markdown: content,
      streaming: false
    });
  });
}

/**
 * The first split card keeps the tool-steps panel when it still fits; if the
 * panel alone pushes the card over the limit, it is dropped so the answer chunk
 * still gets through. The answer chunk is never sacrificed.
 */
function buildFirstSplitCard(input: BuildRichCardInput): string {
  try {
    return buildRichCard(input);
  } catch {
    return buildRichCard({ ...input, steps: [] });
  }
}

/**
 * Split `text` into chunks whose UTF-8 byte length never exceeds `budgetBytes`,
 * preferring line boundaries. When a boundary lands inside a ``` code block the
 * fence is closed at the end of a chunk and re-opened at the start of the next
 * so every chunk renders as valid markdown. A single line that exceeds the
 * budget is split on code-point boundaries (never mid-character).
 *
 * Ported from cc-connect's SplitMessageCodeFenceAware, but byte-based to match
 * Feishu's byte limit (a CJK character is 3 bytes, not 1 rune).
 */
export function splitMarkdownByByteBudget(text: string, budgetBytes: number): string[] {
  if (Buffer.byteLength(text, "utf8") <= budgetBytes) {
    return [text];
  }

  const closingBytes = Buffer.byteLength(CODE_FENCE_CLOSE, "utf8");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentBytes = 0; // byte length of current.join("\n")
  let openFence = ""; // the opening ``` line while inside a code block, else ""

  const limit = (): number => (openFence !== "" ? budgetBytes - closingBytes : budgetBytes);

  const flush = (): void => {
    if (current.length === 0) {
      return;
    }
    let chunk = current.join("\n");
    if (openFence !== "") {
      chunk += CODE_FENCE_CLOSE;
    }
    chunks.push(chunk);
    current = [];
    currentBytes = 0;
    if (openFence !== "") {
      current.push(openFence);
      currentBytes = Buffer.byteLength(openFence, "utf8");
    }
  };

  const pushLine = (line: string): void => {
    const lineBytes = Buffer.byteLength(line, "utf8");
    const separator = current.length > 0 ? 1 : 0;
    if (currentBytes + separator + lineBytes <= limit()) {
      current.push(line);
      currentBytes += separator + lineBytes;
      return;
    }
    flush();
    const sepAfterFlush = current.length > 0 ? 1 : 0;
    if (currentBytes + sepAfterFlush + lineBytes <= limit()) {
      current.push(line);
      currentBytes += sepAfterFlush + lineBytes;
      return;
    }
    splitOversizedLine(line);
  };

  const splitOversizedLine = (line: string): void => {
    const chars = Array.from(line);
    let index = 0;
    while (index < chars.length) {
      let separator = current.length > 0 ? 1 : 0;
      let available = limit() - currentBytes - separator;
      if (available <= 0) {
        flush();
        separator = current.length > 0 ? 1 : 0;
        available = limit() - currentBytes - separator;
      }
      let part = "";
      let partBytes = 0;
      while (index < chars.length) {
        const charBytes = Buffer.byteLength(chars[index], "utf8");
        if (partBytes + charBytes > available) {
          break;
        }
        part += chars[index];
        partBytes += charBytes;
        index += 1;
      }
      if (part === "") {
        flush();
        continue;
      }
      current.push(part);
      currentBytes += separator + partBytes;
      if (index < chars.length) {
        flush();
      }
    }
  };

  for (const line of text.split("\n")) {
    pushLine(line);
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      openFence = openFence !== "" ? "" : trimmed;
    }
  }

  if (current.length > 0) {
    let chunk = current.join("\n");
    if (openFence !== "") {
      chunk += CODE_FENCE_CLOSE;
    }
    chunks.push(chunk);
  }

  return chunks;
}

function buildBodyElements(input: BuildRichCardInput): Record<string, unknown>[] {
  const elements: Record<string, unknown>[] = [];
  if (input.steps.length > 0 || input.streaming) {
    elements.push(buildPanel(input));
  }
  elements.push({ tag: "markdown", content: preprocessFeishuMarkdown(input.markdown) });
  const footer = buildFooter(input);
  if (footer) {
    elements.push(footer);
  }
  return elements;
}

function buildPanel(input: BuildRichCardInput): Record<string, unknown> {
  const visible = input.steps.slice(0, MAX_PANEL_STEPS);
  const overflow = input.steps.length - visible.length;
  const panelElements: Record<string, unknown>[] = [];

  if (visible.length === 0) {
    panelElements.push({
      tag: "div",
      text: { tag: "plain_text", content: "Thinking..." }
    });
  } else {
    for (const step of visible) {
      panelElements.push({
        tag: "div",
        icon: { tag: "standard_icon", token: getToolIcon(step.name) },
        text: { tag: "plain_text", content: richStepBody(step) }
      });
    }
    if (overflow > 0) {
      panelElements.push({
        tag: "div",
        text: { tag: "plain_text", content: `… and ${overflow} more steps` }
      });
    }
  }

  return {
    tag: "collapsible_panel",
    expanded: input.streaming,
    background_color: "grey",
    header: {
      title: { tag: "plain_text", content: panelTitle(input) }
    },
    border: { color: "grey" },
    vertical_spacing: "8px",
    padding: "4px 8px",
    elements: panelElements
  };
}

function panelTitle(input: BuildRichCardInput): string {
  if (input.steps.length === 0) {
    return "Thinking...";
  }
  if (input.streaming) {
    return `Working on it (${input.steps.length} steps)`;
  }
  const order: string[] = [];
  const counts: Record<string, number> = {};
  for (const step of input.steps) {
    const name = richStepDisplayName(step);
    if (counts[name] === undefined) {
      order.push(name);
      counts[name] = 0;
    }
    counts[name] += 1;
  }
  const summary = order.map((name) => (counts[name] > 1 ? `${name}×${counts[name]}` : name)).join(", ");
  const preview = previewLine(input.markdown);
  return preview === "" ? summary : `${summary} · ${preview}`;
}

function previewLine(markdown: string): string {
  const trimmed = markdown.trim();
  const firstLine = trimmed.split("\n", 1)[0] ?? "";
  const chars = Array.from(firstLine);
  if (chars.length > 20) {
    return `${chars.slice(0, 20).join("")}...`;
  }
  return firstLine;
}

function buildFooter(input: BuildRichCardInput): Record<string, unknown> | null {
  const elapsed = input.elapsedMs ?? 0;
  if (!input.streaming && elapsed <= 0) {
    return null;
  }
  const text = input.streaming
    ? `⏱ 运行中 ${formatElapsedCN(elapsed)}...`
    : `⏱ 用时 ${formatElapsedCN(elapsed)}`;
  return {
    tag: "div",
    text: { tag: "plain_text", content: text }
  };
}

function headerTemplate(status: FeishuRichCardStatus): string {
  if (status === "done") {
    return "green";
  }
  if (status === "error") {
    return "red";
  }
  return "blue";
}

function headerTitle(status: FeishuRichCardStatus, nowSec: number | undefined): string {
  if (status === "done") {
    return "Done";
  }
  if (status === "error") {
    return "Error";
  }
  return pickThinkingVerb(nowSec);
}

export function richStepDisplayName(step: PlatformProgressToolStep): string {
  const name = step.name.trim();
  if (name === "") {
    return "Tool";
  }
  return name;
}

export function richStepBody(step: PlatformProgressToolStep): string {
  const summary = (step.summary ?? "").trim() || richStepDisplayName(step);
  const lines = [summary];
  const statusParts: string[] = [];
  if (step.status) {
    statusParts.push(`status: ${step.status}`);
  }
  if (step.exitCode !== undefined) {
    statusParts.push(`exit: ${step.exitCode}`);
  }
  if (statusParts.length > 0) {
    lines.push(statusParts.join(" | "));
  }
  const result = (step.result ?? "").trim();
  if (result !== "") {
    lines.push(result);
  }
  return lines.join("\n");
}
