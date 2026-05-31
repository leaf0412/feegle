import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_ICON,
  getToolIcon,
  pickThinkingVerb,
  THINKING_VERBS,
  TOOL_ICON_MAP
} from "@integrations/feishu/feishu-tool-icons.js";

describe("getToolIcon", () => {
  it("returns the configured icon when the tool name is known", () => {
    expect(getToolIcon("Bash")).toBe(TOOL_ICON_MAP.Bash);
    expect(getToolIcon("WebSearch")).toBe(TOOL_ICON_MAP.WebSearch);
  });

  it("falls back to the default icon for unknown tools", () => {
    expect(getToolIcon("Mystery")).toBe(DEFAULT_TOOL_ICON);
    expect(getToolIcon("")).toBe(DEFAULT_TOOL_ICON);
  });
});

describe("pickThinkingVerb", () => {
  it("rotates through the verb list deterministically when given a fixed second", () => {
    expect(pickThinkingVerb(0)).toBe(`${THINKING_VERBS[0]}...`);
    expect(pickThinkingVerb(THINKING_VERBS.length)).toBe(`${THINKING_VERBS[0]}...`);
    expect(pickThinkingVerb(1)).toBe(`${THINKING_VERBS[1]}...`);
  });

  it("handles negative seconds without throwing", () => {
    const verb = pickThinkingVerb(-3);
    expect(THINKING_VERBS.map((v) => `${v}...`)).toContain(verb);
  });
});
