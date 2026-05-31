import { describe, expect, it } from "vitest";
import { renderFeishuProgressCard } from "@integrations/feishu/feishu-progress-card.js";

describe("renderFeishuProgressCard", () => {
  it("renders running progress with blue header", () => {
    const card = renderFeishuProgressCard({
      title: "Codex",
      state: "running",
      truncated: false,
      entries: [
        { kind: "thinking", text: "分析需求" },
        { kind: "tool_use", tool: "Bash", text: "npm test" }
      ]
    });

    expect(JSON.stringify(card)).toContain("Codex · 进行中");
    expect(JSON.stringify(card)).toContain("\"template\":\"blue\"");
    expect(JSON.stringify(card)).toContain("npm test");
  });

  it("renders failed progress with red header", () => {
    const card = renderFeishuProgressCard({
      title: "Codex",
      state: "failed",
      truncated: false,
      entries: [{ kind: "error", text: "测试失败" }]
    });

    expect(JSON.stringify(card)).toContain("Codex · 失败");
    expect(JSON.stringify(card)).toContain("\"template\":\"red\"");
  });
});
