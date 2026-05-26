import { describe, expect, it } from "vitest";
import {
  buildCardJSONWithStatus,
  buildRichCard,
  buildRichCards,
  formatElapsedCN,
  isCardJSON,
  richStepBody,
  richStepDisplayName,
  splitMarkdownByByteBudget
} from "../../src/feishu/feishu-rich-card.js";
import type { PlatformProgressToolStep } from "../../src/platform/progress.js";

const toolStep = (overrides: Partial<PlatformProgressToolStep> = {}): PlatformProgressToolStep => ({
  kind: "tool_step",
  name: "Bash",
  summary: "ls -la",
  status: "ok",
  exitCode: 0,
  result: "total 0",
  elapsedMs: 1200,
  ...overrides
});

describe("isCardJSON", () => {
  it("recognises schema 2.0 card JSON heuristically", () => {
    expect(isCardJSON('{"schema":"2.0","body":{}}')).toBe(true);
  });

  it("rejects short or non-card payloads", () => {
    expect(isCardJSON("{}")).toBe(false);
    expect(isCardJSON("plain text")).toBe(false);
  });
});

describe("formatElapsedCN", () => {
  it("renders sub-minute durations to one decimal place", () => {
    expect(formatElapsedCN(3_200)).toBe("3.2 秒");
    expect(formatElapsedCN(0)).toBe("0.0 秒");
  });

  it("renders minute/second pairs with zero-padding", () => {
    expect(formatElapsedCN(83_000)).toBe("1 分 23 秒");
    expect(formatElapsedCN(60_000)).toBe("1 分 00 秒");
  });

  it("renders hour/minute pairs", () => {
    expect(formatElapsedCN(3_900_000)).toBe("1 小时 05 分");
  });
});

describe("richStepDisplayName / richStepBody", () => {
  it("falls back to Tool when the step has no name", () => {
    expect(richStepDisplayName({ kind: "tool_step", name: "  " })).toBe("Tool");
  });

  it("composes summary + status meta + result lines", () => {
    expect(richStepBody(toolStep())).toBe(["ls -la", "status: ok | exit: 0", "total 0"].join("\n"));
  });
});

describe("buildCardJSONWithStatus", () => {
  it("uses the right header template per status", () => {
    expect(JSON.parse(buildCardJSONWithStatus("hi", "done")).header.template).toBe("green");
    expect(JSON.parse(buildCardJSONWithStatus("hi", "error")).header.template).toBe("red");
    expect(JSON.parse(buildCardJSONWithStatus("hi", "working")).header.template).toBe("blue");
  });
});

describe("buildRichCard", () => {
  it("renders a streaming card with collapsible panel, markdown body, and running footer", () => {
    const json = buildRichCard({
      status: "working",
      steps: [toolStep()],
      markdown: "正在执行命令",
      streaming: true,
      elapsedMs: 1500,
      thinkingVerbSec: 0
    });
    const card = JSON.parse(json) as {
      config: { streaming_mode: boolean };
      header: { template: string; title: { content: string } };
      body: { elements: Array<Record<string, unknown>> };
    };
    expect(card.config.streaming_mode).toBe(true);
    expect(card.header.template).toBe("blue");
    expect(card.header.title.content.endsWith("...")).toBe(true);
    const tags = card.body.elements.map((element) => element.tag);
    expect(tags).toContain("collapsible_panel");
    expect(tags).toContain("markdown");
    const footer = card.body.elements[card.body.elements.length - 1];
    const footerText = (footer.text as { content: string }).content;
    expect(footerText.startsWith("⏱ 运行中")).toBe(true);
  });

  it("shows a running timer immediately when the streaming card starts", () => {
    const json = buildRichCard({
      status: "working",
      steps: [],
      markdown: "Codex 正在思考…",
      streaming: true,
      elapsedMs: 0,
      thinkingVerbSec: 0
    });
    const card = JSON.parse(json) as { body: { elements: Array<Record<string, unknown>> } };
    const footer = card.body.elements[card.body.elements.length - 1];
    expect((footer.text as { content: string }).content).toBe("⏱ 运行中 0.0 秒...");
  });

  it("uses Done header template and elapsed footer when completed", () => {
    const json = buildRichCard({
      status: "done",
      steps: [toolStep()],
      markdown: "最终结果",
      streaming: false,
      elapsedMs: 90_000
    });
    const card = JSON.parse(json) as {
      header: { template: string; title: { content: string } };
      body: { elements: Array<Record<string, unknown>> };
    };
    expect(card.header.template).toBe("green");
    expect(card.header.title.content).toBe("Done");
    const footer = card.body.elements[card.body.elements.length - 1];
    expect((footer.text as { content: string }).content).toBe("⏱ 用时 1 分 30 秒");
  });

  it("omits the panel when there are no steps and not streaming", () => {
    const json = buildRichCard({
      status: "done",
      steps: [],
      markdown: "回答",
      streaming: false,
      elapsedMs: 0
    });
    const card = JSON.parse(json) as { body: { elements: Array<Record<string, unknown>> } };
    expect(card.body.elements.some((element) => element.tag === "collapsible_panel")).toBe(false);
  });

  it("throws when the encoded card exceeds the 28KB Feishu limit", () => {
    const fatStep = toolStep({ result: "x".repeat(40_000) });
    expect(() =>
      buildRichCard({
        status: "working",
        steps: [fatStep],
        markdown: "tiny",
        streaming: true,
        elapsedMs: 100
      })
    ).toThrow(/exceeds 28000 bytes/);
  });
});

const byteLen = (value: string): number => Buffer.byteLength(value, "utf8");

describe("splitMarkdownByByteBudget", () => {
  it("returns the text untouched when it fits the budget", () => {
    expect(splitMarkdownByByteBudget("short answer", 1000)).toEqual(["short answer"]);
  });

  it("splits a long answer on line boundaries with every chunk under budget", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `line number ${i}`);
    const chunks = splitMarkdownByByteBudget(lines.join("\n"), 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(byteLen(chunk)).toBeLessThanOrEqual(60);
    }
    // No content is lost: re-joining yields back the original lines.
    expect(chunks.join("\n").split("\n")).toEqual(lines);
  });

  it("closes and re-opens a code fence when a split lands inside a code block", () => {
    const body = Array.from({ length: 20 }, (_, i) => `code row ${i}`).join("\n");
    const text = ["前言一段话", "```ts", body, "```", "结尾"].join("\n");
    const chunks = splitMarkdownByByteBudget(text, 60);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Each code-bearing chunk must have a balanced number of fences.
      const fences = (chunk.match(/```/g) ?? []).length;
      expect(fences % 2).toBe(0);
    }
  });

  it("splits within a single oversized line on code-point boundaries", () => {
    const chunks = splitMarkdownByByteBudget("一二三四五六七八九十", 9); // each CJK char = 3 bytes
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(byteLen(chunk)).toBeLessThanOrEqual(9);
    }
    // Re-concatenating restores the original string with no broken characters.
    expect(chunks.join("")).toBe("一二三四五六七八九十");
  });
});

describe("buildRichCards", () => {
  it("returns a single card when everything fits (unchanged common path)", () => {
    const cards = buildRichCards({
      status: "done",
      steps: [toolStep()],
      markdown: "最终结果",
      streaming: false,
      elapsedMs: 5_000
    });
    expect(cards).toHaveLength(1);
    expect(JSON.parse(cards[0]).header.template).toBe("green");
  });

  it("splits an oversized answer into multiple cards, panel only on the first", () => {
    const huge = "段落内容。".repeat(8_000); // ~120KB of CJK text
    const cards = buildRichCards({
      status: "done",
      steps: [toolStep()],
      markdown: huge,
      streaming: false,
      elapsedMs: 90_000
    });
    expect(cards.length).toBeGreaterThan(1);
    for (const card of cards) {
      expect(byteLen(card)).toBeLessThanOrEqual(28_000);
    }
    const first = JSON.parse(cards[0]) as { body: { elements: Array<{ tag: string }> } };
    const rest = JSON.parse(cards[1]) as { body: { elements: Array<{ tag: string }> } };
    expect(first.body.elements.some((element) => element.tag === "collapsible_panel")).toBe(true);
    expect(rest.body.elements.some((element) => element.tag === "collapsible_panel")).toBe(false);
  });
});
