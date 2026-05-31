import { describe, expect, it, vi } from "vitest";
import { createRequirementPlanningAgent } from "@plugins/requirement-workflow/requirement-planning-agent.js";

function makeFakeAgents(chatReply: string | undefined) {
  const chat = chatReply !== undefined ? vi.fn().mockResolvedValue(chatReply) : undefined;
  return {
    registry: {
      resolveActiveAgent: () => (chat !== undefined ? { chat } : undefined)
    } as never,
    chat
  };
}

describe("createRequirementPlanningAgent", () => {
  describe("runPlanGeneration", () => {
    it("calls resolveActiveAgent and chat with a prompt containing the requirementText", async () => {
      const { registry, chat } = makeFakeAgents("# Plan\n\n- step 1\n- step 2");
      const agent = createRequirementPlanningAgent(registry);

      const result = await agent.runPlanGeneration({
        requirementId: "reqwf_1",
        requirementText: "Build a login page"
      });

      expect(chat).toHaveBeenCalledOnce();
      const [messages] = (chat as ReturnType<typeof vi.fn>).mock.calls[0] as [Array<{ role: string; content: string }>];
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toContain("Build a login page");
    });

    it("returns markdown equal to the trimmed agent reply", async () => {
      const { registry } = makeFakeAgents("# Plan\n\n- step 1\n- step 2");
      const agent = createRequirementPlanningAgent(registry);

      const result = await agent.runPlanGeneration({
        requirementId: "reqwf_1",
        requirementText: "Build a login page"
      });

      expect(result.markdown).toBe("# Plan\n\n- step 1\n- step 2");
    });

    it("returns a non-empty summary derived from the first line", async () => {
      const { registry } = makeFakeAgents("# Plan\n\n- step 1\n- step 2");
      const agent = createRequirementPlanningAgent(registry);

      const result = await agent.runPlanGeneration({
        requirementId: "reqwf_1",
        requirementText: "Build a login page"
      });

      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary).toBe("Plan");
    });

    it("strips leading #/- from the summary line", async () => {
      const { registry } = makeFakeAgents("## Implementation Plan\n\nstep 1");
      const agent = createRequirementPlanningAgent(registry);

      const result = await agent.runPlanGeneration({
        requirementId: "reqwf_2",
        requirementText: "Any requirement"
      });

      expect(result.summary).toBe("Implementation Plan");
    });

    it("truncates summary to 80 chars", async () => {
      const longLine = "A".repeat(100);
      const { registry } = makeFakeAgents(`${longLine}\n\nsome content`);
      const agent = createRequirementPlanningAgent(registry);

      const result = await agent.runPlanGeneration({
        requirementId: "reqwf_3",
        requirementText: "Any requirement"
      });

      expect(result.summary.length).toBe(80);
    });

    it("throws 'No active agent provider for requirement planning' when resolveActiveAgent returns undefined", async () => {
      const { registry } = makeFakeAgents(undefined);
      const agent = createRequirementPlanningAgent(registry);

      await expect(
        agent.runPlanGeneration({ requirementId: "reqwf_1", requirementText: "x" })
      ).rejects.toThrow("No active agent provider for requirement planning");
    });

    it("throws 'Agent returned empty plan' when chat resolves to empty string", async () => {
      const { registry } = makeFakeAgents("");
      const agent = createRequirementPlanningAgent(registry);

      await expect(
        agent.runPlanGeneration({ requirementId: "reqwf_1", requirementText: "x" })
      ).rejects.toThrow("Agent returned empty plan");
    });

    it("throws 'Agent returned empty plan' when chat resolves to whitespace only", async () => {
      const { registry } = makeFakeAgents("   \n  \t  ");
      const agent = createRequirementPlanningAgent(registry);

      await expect(
        agent.runPlanGeneration({ requirementId: "reqwf_1", requirementText: "x" })
      ).rejects.toThrow("Agent returned empty plan");
    });
  });

  describe("runPlanRevision", () => {
    it("passes currentPlanMarkdown and feedback into the prompt", async () => {
      const { registry, chat } = makeFakeAgents("# Revised Plan\n\n- new step");
      const agent = createRequirementPlanningAgent(registry);

      await agent.runPlanRevision({
        requirementId: "reqwf_1",
        requirementText: "Build a login page",
        currentPlanMarkdown: "# Old Plan\n\n- old step",
        feedback: "Add test coverage"
      });

      const [messages] = (chat as ReturnType<typeof vi.fn>).mock.calls[0] as [Array<{ role: string; content: string }>];
      expect(messages[0].content).toContain("# Old Plan\n\n- old step");
      expect(messages[0].content).toContain("Add test coverage");
      expect(messages[0].content).toContain("Build a login page");
    });

    it("returns parsed summary and markdown from the agent reply", async () => {
      const { registry } = makeFakeAgents("# Revised Plan\n\n- new step");
      const agent = createRequirementPlanningAgent(registry);

      const result = await agent.runPlanRevision({
        requirementId: "reqwf_1",
        requirementText: "Build a login page",
        currentPlanMarkdown: "# Old Plan",
        feedback: "Add tests"
      });

      expect(result.markdown).toBe("# Revised Plan\n\n- new step");
      expect(result.summary).toBe("Revised Plan");
    });

    it("throws 'No active agent provider for requirement planning' when no active agent", async () => {
      const { registry } = makeFakeAgents(undefined);
      const agent = createRequirementPlanningAgent(registry);

      await expect(
        agent.runPlanRevision({
          requirementId: "reqwf_1",
          requirementText: "x",
          currentPlanMarkdown: "# Plan",
          feedback: "y"
        })
      ).rejects.toThrow("No active agent provider for requirement planning");
    });

    it("throws 'Agent returned empty plan' when chat resolves to empty string", async () => {
      const { registry } = makeFakeAgents("");
      const agent = createRequirementPlanningAgent(registry);

      await expect(
        agent.runPlanRevision({
          requirementId: "reqwf_1",
          requirementText: "x",
          currentPlanMarkdown: "# Plan",
          feedback: "y"
        })
      ).rejects.toThrow("Agent returned empty plan");
    });
  });
});
