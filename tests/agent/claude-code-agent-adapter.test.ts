import { describe, expect, it } from "vitest";
import { ClaudeCodeAgentAdapter } from "../../src/agent/claude-code-agent-adapter.js";

describe("ClaudeCodeAgentAdapter", () => {
  it("delegates plan generation to the injected Claude Code runner with requirement text", async () => {
    const prompts: string[] = [];
    const adapter = new ClaudeCodeAgentAdapter(async (prompt) => {
      prompts.push(prompt);
      return "Claude Code 计划";
    });

    const plan = await adapter.generatePlan({
      requirementId: "om_1",
      title: "登录页",
      requirementText: "做一个登录页"
    });

    expect(plan).toBe("Claude Code 计划");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Instruction: Generate a TDD development plan.");
    expect(prompts[0]).toContain("feegle:file:/absolute/path/to/file");
    expect(prompts[0]).toContain('## requirement_id\n~~~json\n"om_1"\n~~~');
    expect(prompts[0]).toContain('## requirement_text\n~~~json\n"做一个登录页"\n~~~');
  });
});
