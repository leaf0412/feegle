import { describe, expect, it } from "vitest";
import { createRequirementDevelopmentAgent } from "@plugins/requirement-workflow/requirement-development-agent.js";
import type { Agent } from "@integrations/agent/agent-session.js";

// A fake Agent that records each turn's prompt + cwd and answers with `summary`.
function makeFakeAgent(summary: string): {
  agent: Agent;
  calls: Array<{ prompt: string; cwd?: string }>;
} {
  const calls: Array<{ prompt: string; cwd?: string }> = [];
  const agent: Agent = {
    startSession(options) {
      return {
        async *send(prompt) {
          calls.push({ prompt, cwd: options?.cwd });
          yield { kind: "text", text: summary };
          yield { kind: "result" };
        },
        currentSessionId: () => undefined,
        async close() {}
      };
    }
  };
  return { agent, calls };
}

function makeAgents(agent: Agent | undefined) {
  return { resolveActiveAgent: () => agent };
}

describe("createRequirementDevelopmentAgent", () => {
  it("runs the agent in cwd = the requested working directory", async () => {
    const { agent, calls } = makeFakeAgent("implementation complete");
    const adapter = createRequirementDevelopmentAgent(makeAgents(agent) as never);

    await adapter.runDevelopmentTask({
      cwd: "/workspace/my-repo",
      prompt: "Implement login feature",
      requirementId: "reqwf_abc"
    });

    expect(calls[0].cwd).toBe("/workspace/my-repo");
    expect(calls[0].prompt).toContain("/workspace/my-repo");
  });

  it("includes the task prompt in the development prompt", async () => {
    const { agent, calls } = makeFakeAgent("done");
    const adapter = createRequirementDevelopmentAgent(makeAgents(agent) as never);

    await adapter.runDevelopmentTask({
      cwd: "/workspace/repo",
      prompt: "Build the user dashboard",
      requirementId: "reqwf_xyz"
    });

    expect(calls[0].prompt).toContain("Build the user dashboard");
  });

  it("maps the agent's answer to {exitCode:0, summary}", async () => {
    const { agent } = makeFakeAgent("Feature implemented successfully");
    const adapter = createRequirementDevelopmentAgent(makeAgents(agent) as never);

    const result = await adapter.runDevelopmentTask({
      cwd: "/workspace/repo",
      prompt: "Implement feature",
      requirementId: "reqwf_1"
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Feature implemented successfully");
  });

  it("passes requirementId into the development prompt", async () => {
    const { agent, calls } = makeFakeAgent("ok");
    const adapter = createRequirementDevelopmentAgent(makeAgents(agent) as never);

    await adapter.runDevelopmentTask({
      cwd: "/workspace/repo",
      prompt: "Any prompt",
      requirementId: "reqwf_check"
    });

    expect(calls[0].prompt).toContain("reqwf_check");
  });

  it("throws 'No active agent provider for requirement development' when no active agent", async () => {
    const adapter = createRequirementDevelopmentAgent(makeAgents(undefined) as never);

    await expect(
      adapter.runDevelopmentTask({
        cwd: "/workspace/repo",
        prompt: "Any prompt",
        requirementId: "reqwf_1"
      })
    ).rejects.toThrow("No active agent provider for requirement development");
  });

  it("propagates errors thrown by the agent without swallowing", async () => {
    const agent: Agent = {
      startSession() {
        return {
          // eslint-disable-next-line require-yield
          async *send() {
            throw new Error("agent spawn failed");
          },
          currentSessionId: () => undefined,
          async close() {}
        };
      }
    };
    const adapter = createRequirementDevelopmentAgent(makeAgents(agent) as never);

    await expect(
      adapter.runDevelopmentTask({
        cwd: "/workspace/repo",
        prompt: "prompt",
        requirementId: "reqwf_1"
      })
    ).rejects.toThrow("agent spawn failed");
  });
});
