import { describe, expect, it, vi } from "vitest";
import { createRequirementDevelopmentAgent } from "@plugins/requirement-workflow/requirement-development-agent.js";

function makeFakeAgentCli(taskResult: string) {
  return {
    runDevelopmentTask: vi.fn().mockResolvedValue(taskResult)
  };
}

function makeAgents(agentCli: ReturnType<typeof makeFakeAgentCli> | undefined) {
  return {
    resolveActiveAgent: vi.fn().mockReturnValue(agentCli)
  };
}

describe("createRequirementDevelopmentAgent", () => {
  it("calls runDevelopmentTask with repository.localPath equal to cwd", async () => {
    const fakeAgent = makeFakeAgentCli("implementation complete");
    const agents = makeAgents(fakeAgent);
    const adapter = createRequirementDevelopmentAgent(agents as never);

    await adapter.runDevelopmentTask({
      cwd: "/workspace/my-repo",
      prompt: "Implement login feature",
      requirementId: "reqwf_abc"
    });

    expect(fakeAgent.runDevelopmentTask).toHaveBeenCalledOnce();
    const callArgs = fakeAgent.runDevelopmentTask.mock.calls[0] as [
      { requirementId: string; title: string; requirementText: string },
      { repositoryId: string; localPath: string; branchName: string },
      string
    ];
    const [_reqCtx, repoCtx] = callArgs;
    expect(repoCtx.localPath).toBe("/workspace/my-repo");
  });

  it("calls runDevelopmentTask with task equal to prompt", async () => {
    const fakeAgent = makeFakeAgentCli("done");
    const agents = makeAgents(fakeAgent);
    const adapter = createRequirementDevelopmentAgent(agents as never);

    await adapter.runDevelopmentTask({
      cwd: "/workspace/repo",
      prompt: "Build the user dashboard",
      requirementId: "reqwf_xyz"
    });

    const callArgs = fakeAgent.runDevelopmentTask.mock.calls[0] as [unknown, unknown, string];
    const [_reqCtx, _repoCtx, task] = callArgs;
    expect(task).toBe("Build the user dashboard");
  });

  it("maps a resolved DevelopmentTaskResult string to {exitCode:0, summary}", async () => {
    const fakeAgent = makeFakeAgentCli("Feature implemented successfully");
    const agents = makeAgents(fakeAgent);
    const adapter = createRequirementDevelopmentAgent(agents as never);

    const result = await adapter.runDevelopmentTask({
      cwd: "/workspace/repo",
      prompt: "Implement feature",
      requirementId: "reqwf_1"
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("Feature implemented successfully");
  });

  it("passes requirementId to the agent requirement context", async () => {
    const fakeAgent = makeFakeAgentCli("ok");
    const agents = makeAgents(fakeAgent);
    const adapter = createRequirementDevelopmentAgent(agents as never);

    await adapter.runDevelopmentTask({
      cwd: "/workspace/repo",
      prompt: "Any prompt",
      requirementId: "reqwf_check"
    });

    const callArgs = fakeAgent.runDevelopmentTask.mock.calls[0] as [
      { requirementId: string; title: string; requirementText: string },
      unknown,
      unknown
    ];
    const [reqCtx] = callArgs;
    expect(reqCtx.requirementId).toBe("reqwf_check");
  });

  it("throws 'No active agent provider for requirement development' when no active agent", async () => {
    const agents = makeAgents(undefined);
    const adapter = createRequirementDevelopmentAgent(agents as never);

    await expect(
      adapter.runDevelopmentTask({
        cwd: "/workspace/repo",
        prompt: "Any prompt",
        requirementId: "reqwf_1"
      })
    ).rejects.toThrow("No active agent provider for requirement development");
  });

  it("propagates errors thrown by runDevelopmentTask without swallowing", async () => {
    const fakeAgent = {
      runDevelopmentTask: vi.fn().mockRejectedValue(new Error("agent spawn failed"))
    };
    const agents = makeAgents(fakeAgent as never);
    const adapter = createRequirementDevelopmentAgent(agents as never);

    await expect(
      adapter.runDevelopmentTask({
        cwd: "/workspace/repo",
        prompt: "prompt",
        requirementId: "reqwf_1"
      })
    ).rejects.toThrow("agent spawn failed");
  });
});
