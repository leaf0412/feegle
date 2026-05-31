import { describe, expect, it, vi } from "vitest";
import { RequirementExecutionStore } from "@plugins/requirement-workflow/requirement-execution-store.js";
import { RequirementExecutionService } from "@plugins/requirement-workflow/requirement-execution-service.js";

describe("RequirementExecutionStore", () => {
  it("requires approval before execution can start", () => {
    const store = new RequirementExecutionStore();
    store.createPendingExecution({
      requirementId: "reqwf_1",
      planVersion: 2,
      requestedByUserId: "user_1"
    });

    expect(() => store.markExecuting({
      requirementId: "reqwf_1",
      approvedByUserId: "user_1",
      worktreePath: "/tmp/worktree",
      headBranch: "yb/feat/reqwf_1"
    })).toThrow("Execution must be approved before it can start: reqwf_1");

    store.approve({ requirementId: "reqwf_1", approvedByUserId: "user_1" });
    expect(store.markExecuting({
      requirementId: "reqwf_1",
      approvedByUserId: "user_1",
      worktreePath: "/tmp/worktree",
      headBranch: "yb/feat/reqwf_1"
    }).status).toBe("executing");
  });

  it("transitions executing -> implementation_ready", () => {
    const store = new RequirementExecutionStore();
    store.createPendingExecution({ requirementId: "reqwf_2", planVersion: 1, requestedByUserId: "user_1" });
    store.approve({ requirementId: "reqwf_2", approvedByUserId: "user_1" });
    store.markExecuting({ requirementId: "reqwf_2", approvedByUserId: "user_1", worktreePath: "/tmp/wt", headBranch: "yb/feat/reqwf_2" });
    const ready = store.markImplementationReady({ requirementId: "reqwf_2", summary: "done", diffStats: { filesChanged: 1, insertions: 2, deletions: 0 } });
    expect(ready.status).toBe("implementation_ready");
    expect(store.latest("reqwf_2")?.status).toBe("implementation_ready");
  });

  it("returns undefined for unknown requirement", () => {
    const store = new RequirementExecutionStore();
    expect(store.latest("nope")).toBeUndefined();
  });

  it("approve rejects a non-pending execution", () => {
    const store = new RequirementExecutionStore();
    store.createPendingExecution({ requirementId: "reqwf_3", planVersion: 1, requestedByUserId: "user_1" });
    store.approve({ requirementId: "reqwf_3", approvedByUserId: "user_1" });
    expect(() => store.approve({ requirementId: "reqwf_3", approvedByUserId: "user_1" }))
      .toThrow("cannot be approved from status approved");
  });
});

describe("RequirementExecutionService", () => {
  function makeGit() {
    return {
      getRepoRoot: vi.fn().mockResolvedValue("/repo"),
      createWorktree: vi.fn().mockResolvedValue(undefined),
      diffStats: vi.fn().mockResolvedValue({ filesChanged: 2, insertions: 10, deletions: 1 })
    };
  }

  it("creates a worktree and runs the development agent after approval", async () => {
    const git = makeGit();
    const agent = { runDevelopmentTask: vi.fn().mockResolvedValue({ exitCode: 0, summary: "done" }) };
    const executionStore = {
      latest: vi.fn().mockReturnValue({ requirementId: "reqwf_1", status: "approved", planVersion: 1 }),
      markExecuting: vi.fn(),
      markImplementationReady: vi.fn()
    };

    const service = new RequirementExecutionService({
      git: git as never,
      agent: agent as never,
      executionStore: executionStore as never,
      workspacePath: "/repo",
      worktreeRoot: "/tmp/feegle-worktrees"
    });

    const result = await service.execute({
      requirementId: "reqwf_1",
      planMarkdown: "# Plan",
      approvedByUserId: "user_1"
    });

    expect(git.createWorktree).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: "/repo",
      newBranch: "yb/feat/reqwf_1"
    }));
    expect(agent.runDevelopmentTask).toHaveBeenCalledWith(expect.objectContaining({
      cwd: "/tmp/feegle-worktrees/reqwf_1"
    }));
    // prompt carries requirement id + full plan markdown (intent)
    const agentArg = agent.runDevelopmentTask.mock.calls[0][0];
    expect(agentArg.prompt).toContain("reqwf_1");
    expect(agentArg.prompt).toContain("# Plan");
    // store transitions were driven
    expect(executionStore.markExecuting).toHaveBeenCalledWith(expect.objectContaining({
      requirementId: "reqwf_1", approvedByUserId: "user_1", worktreePath: "/tmp/feegle-worktrees/reqwf_1", headBranch: "yb/feat/reqwf_1"
    }));
    expect(executionStore.markImplementationReady).toHaveBeenCalledWith(expect.objectContaining({
      requirementId: "reqwf_1", summary: "done", diffStats: { filesChanged: 2, insertions: 10, deletions: 1 }
    }));
    expect(result.status).toBe("implementation_ready");
  });

  it("throws and does not mark ready when the agent exits non-zero", async () => {
    const git = makeGit();
    const agent = { runDevelopmentTask: vi.fn().mockResolvedValue({ exitCode: 1, summary: "boom" }) };
    const executionStore = {
      latest: vi.fn().mockReturnValue({ requirementId: "reqwf_1", status: "approved", planVersion: 1 }),
      markExecuting: vi.fn(),
      markImplementationReady: vi.fn()
    };
    const service = new RequirementExecutionService({
      git: git as never, agent: agent as never, executionStore: executionStore as never,
      workspacePath: "/repo", worktreeRoot: "/tmp/feegle-worktrees"
    });

    await expect(service.execute({ requirementId: "reqwf_1", planMarkdown: "# Plan", approvedByUserId: "user_1" }))
      .rejects.toThrow("Requirement execution failed: boom");
    expect(executionStore.markImplementationReady).not.toHaveBeenCalled();
  });
});
