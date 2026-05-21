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
