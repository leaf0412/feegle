import { describe, expect, it } from "vitest";
import { buildIterationPrompt, deriveSlug } from "@features/workbench/plan-execution-helpers.js";

describe("deriveSlug", () => {
  it("normalises English title to snake_case", () => {
    expect(deriveSlug("Implement Plan Execution Service", "plan_01HXY1")).toBe(
      "implement_plan_execution_service"
    );
  });

  it("compresses punctuation and spaces to single underscores", () => {
    expect(deriveSlug("Fix - Feishu webhook (500)!", "plan_01HXY1")).toBe("fix_feishu_webhook_500");
  });

  it("truncates at 40 chars", () => {
    const long = "very ".repeat(20) + "long title";
    const slug = deriveSlug(long, "plan_01HXY1");

    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).toMatch(/^[a-z0-9_]+$/);
  });

  it("falls back to plan_<ulid6> when title produces empty slug", () => {
    expect(deriveSlug("需求 #4321 完善", "plan_01HXY1AAAA")).toBe("plan_Y1AAAA");
    expect(deriveSlug("需求 #4321 完善", "plan_01HZZZZZZZ").startsWith("plan_")).toBe(true);
  });
});

describe("buildIterationPrompt", () => {
  it("emits a first-iteration prompt with auto-commit instruction", () => {
    const prompt = buildIterationPrompt("# Plan\n\n- step", null);

    expect(prompt).toContain("Implement this plan");
    expect(prompt).toContain("Auto-commit");
    expect(prompt).toContain("# Plan\n\n- step");
    expect(prompt).not.toContain("Adjustment request");
  });

  it("includes both original plan and adjustment note for revise iterations", () => {
    const prompt = buildIterationPrompt("# Plan\n\n- step", "增加错误处理");

    expect(prompt).toContain("Continue work on this plan");
    expect(prompt).toContain("Original plan:");
    expect(prompt).toContain("# Plan\n\n- step");
    expect(prompt).toContain("Adjustment request:");
    expect(prompt).toContain("增加错误处理");
  });
});
