import { describe, expect, it } from "vitest";
import {
  buildCardJSONWithStatus,
  buildRichCard,
  formatElapsedCN,
  isCardJSON,
  richStepBody,
  richStepDisplayName
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
