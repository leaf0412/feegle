import { describe, expect, it } from "vitest";
import { RequirementExecutionStore } from "@plugins/requirement-workflow/requirement-execution-store.js";

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
});
