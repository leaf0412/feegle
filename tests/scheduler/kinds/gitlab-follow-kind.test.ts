import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../../src/app/runtime-db.js";
import { GitLabFollowStore, type FollowEntry, type FollowStatus } from "../../../src/gitlab/gitlab-follow-store.js";
import { GitLabFollowKind } from "../../../src/scheduler/kinds/gitlab-follow-kind.js";
import type { TaskContext } from "../../../src/scheduler/task-context.js";

const ISSUE_URL = "https://gitlab.example.com/group/proj/-/issues/42";

function makeCtx(): TaskContext {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { logger } as unknown as TaskContext;
}

async function flush(predicate: () => boolean, tries = 20): Promise<void> {
  for (let i = 0; i < tries && !predicate(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("GitLabFollowKind metadata", () => {
  const mockDeps = {
    gitlab: {} as any,
    store: {} as any,
    agents: {} as any,
    git: {} as any,
    config: { token: "test-token", host: "www.lejuhub.com", workspaceRoot: "/tmp/test" }
  };

  it("has correct id and title", () => {
    const kind = new GitLabFollowKind(mockDeps);
    expect(kind.id).toBe("gitlab-follow");
    expect(kind.title).toBe("GitLab follow");
  });

  it("parses params correctly", () => {
    const kind = new GitLabFollowKind(mockDeps);
    expect(kind.parseParams({ botUsername: "my-bot" }).botUsername).toBe("my-bot");
  });

  it("rejects missing or empty botUsername", () => {
    const kind = new GitLabFollowKind(mockDeps);
    expect(() => kind.parseParams({})).toThrow();
    expect(() => kind.parseParams({ botUsername: "" })).toThrow();
  });

  it("describes params with bot username", () => {
    const kind = new GitLabFollowKind(mockDeps);
    expect(kind.describeParams({ botUsername: "my-bot" })).toBe("bot: @my-bot");
  });

  it("refuses to run without a [gitlab] config section", async () => {
    const kind = new GitLabFollowKind({ ...mockDeps, config: null });
    await expect(kind.run(makeCtx(), { botUsername: "bot" })).rejects.toThrow(/gitlab/);
  });
});

describe("GitLabFollowKind state machine", () => {
  let home: string;
  let db: RuntimeDb;
  let store: GitLabFollowStore;
  let workspaceRoot: string;

  // mocks rebuilt per test
  let gitlab: {
    searchMentionedIssues: ReturnType<typeof vi.fn>;
    getIssue: ReturnType<typeof vi.fn>;
    getNotes: ReturnType<typeof vi.fn>;
    postNote: ReturnType<typeof vi.fn>;
  };
  let agent: { chat: ReturnType<typeof vi.fn>; runDevelopmentTask: ReturnType<typeof vi.fn> };
  let agents: { resolveActiveAgent: ReturnType<typeof vi.fn> };
  let git: {
    cloneWithToken: ReturnType<typeof vi.fn>;
    createWorktree: ReturnType<typeof vi.fn>;
    push: ReturnType<typeof vi.fn>;
    getBranchSha: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-follow-kind-"));
    db = openRuntimeDb(join(home, "feegle.db"));
    store = new GitLabFollowStore(db);
    workspaceRoot = join(home, "repos");

    gitlab = {
      searchMentionedIssues: vi.fn().mockResolvedValue([]),
      getIssue: vi.fn().mockResolvedValue({ title: "Fix thing", description: "desc", state: "opened" }),
      getNotes: vi.fn().mockResolvedValue([]),
      postNote: vi.fn().mockResolvedValue(undefined)
    };
    agent = {
      chat: vi.fn().mockResolvedValue("agent reply"),
      runDevelopmentTask: vi.fn().mockResolvedValue(undefined)
    };
    agents = { resolveActiveAgent: vi.fn().mockReturnValue(agent) };
    git = {
      cloneWithToken: vi.fn().mockResolvedValue(undefined),
      createWorktree: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
      getBranchSha: vi.fn().mockResolvedValue("sha")
    };
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  function buildKind(): GitLabFollowKind {
    return new GitLabFollowKind({
      gitlab: gitlab as any,
      store,
      agents: agents as any,
      git: git as any,
      config: { token: "test-token", host: "www.lejuhub.com", workspaceRoot }
    });
  }

  function seedEntry(status: FollowStatus, extra?: Record<string, unknown>): FollowEntry {
    const entry = store.ensureEntry({
      host: "gitlab.example.com",
      projectId: 7,
      issueIid: 42,
      issueUrl: ISSUE_URL,
      projectPath: "group/proj",
      title: "Fix thing"
    });
    if (status !== "discovered" || extra) store.setStatus(entry, status, extra);
    return store.get("gitlab.example.com", 7, 42)!;
  }

  const reload = () => store.get("gitlab.example.com", 7, 42)!;

  it("ingests an opened mentioned issue as a discovered entry", async () => {
    gitlab.searchMentionedIssues.mockResolvedValue([
      { iid: 42, project_id: 7, web_url: ISSUE_URL, title: "Fix thing", state: "opened" }
    ]);

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(gitlab.searchMentionedIssues).toHaveBeenCalledWith("bot", "www.lejuhub.com");
    expect(reload().status).toBe("cloning"); // discovered -> advanced one step in same run
  });

  it("rejects an active entry once its issue is closed", async () => {
    seedEntry("proposed");
    gitlab.searchMentionedIssues.mockResolvedValue([
      { iid: 42, project_id: 7, web_url: ISSUE_URL, title: "Fix thing", state: "closed" }
    ]);

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(reload().status).toBe("rejected");
  });

  it("discovered -> cloning: clones repo with token and advances", async () => {
    seedEntry("discovered");

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(git.cloneWithToken).toHaveBeenCalledTimes(1);
    const [cloneUrl] = git.cloneWithToken.mock.calls[0]!;
    expect(cloneUrl).toBe("https://gitlab.example.com/group/proj.git");
    expect(reload().status).toBe("cloning");
  });

  it("cloning -> proposed: runs agent analysis and posts a comment", async () => {
    seedEntry("cloning");
    agent.chat.mockResolvedValue("这是实现方案");

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(agent.chat).toHaveBeenCalledTimes(1);
    expect(gitlab.postNote).toHaveBeenCalledTimes(1);
    const [, body] = gitlab.postNote.mock.calls[0]!;
    expect(body).toContain("自动分析");
    expect(body).toContain("这是实现方案");

    const after = reload();
    expect(after.status).toBe("proposed");
    expect(after.agentResponse).toBe("这是实现方案");
  });

  it("proposed -> branch_proposed: confirms plan and proposes a branch", async () => {
    seedEntry("proposed");
    gitlab.getNotes.mockResolvedValue([
      { body: "## 自动分析", system: false, author: { username: "bot" } },
      { body: "方案不错，继续", system: false, author: { username: "human" } }
    ]);
    agent.chat.mockResolvedValue("yb/feat/fix_thing");

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    const after = reload();
    expect(after.status).toBe("branch_proposed");
    expect(after.branchName).toBe("yb/feat/fix_thing");
    expect(gitlab.postNote).toHaveBeenCalledTimes(1);
  });

  it("proposed -> rejected when the user replies with a rejection", async () => {
    seedEntry("proposed");
    gitlab.getNotes.mockResolvedValue([
      { body: "## 自动分析", system: false, author: { username: "bot" } },
      { body: "拒绝", system: false, author: { username: "human" } }
    ]);

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(reload().status).toBe("rejected");
    expect(agent.chat).not.toHaveBeenCalled(); // must not waste an agent call on a rejection
  });

  it("proposed stays put while waiting for a user reply", async () => {
    seedEntry("proposed");
    gitlab.getNotes.mockResolvedValue([
      { body: "## 自动分析", system: false, author: { username: "bot" } }
    ]);

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(reload().status).toBe("proposed");
    expect(gitlab.postNote).not.toHaveBeenCalled();
  });

  it("branch_proposed -> executing: creates a worktree off the resolved base branch", async () => {
    seedEntry("branch_proposed", { branchName: "yb/feat/fix_thing" });
    gitlab.getNotes.mockResolvedValue([
      { body: "## 分支建议", system: false, author: { username: "bot" } },
      { body: "确认", system: false, author: { username: "human" } }
    ]);

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(git.createWorktree).toHaveBeenCalledTimes(1);
    const arg = git.createWorktree.mock.calls[0]![0];
    expect(arg.newBranch).toBe("yb/feat/fix_thing");
    expect(arg.baseBranch).toBe("main"); // getBranchSha("main") resolved
    // note: "executing" is a transient state — runExecution fires immediately,
    // so we assert the worktree wiring here and the final pushing state in the next test
  });

  it("executing eventually reaches pushing once the agent finishes", async () => {
    seedEntry("branch_proposed", { branchName: "yb/feat/fix_thing" });
    gitlab.getNotes.mockResolvedValue([
      { body: "## 分支建议", system: false, author: { username: "bot" } },
      { body: "确认", system: false, author: { username: "human" } }
    ]);

    await buildKind().run(makeCtx(), { botUsername: "bot" });
    await flush(() => reload().status === "pushing");

    expect(agent.runDevelopmentTask).toHaveBeenCalledTimes(1);
    expect(reload().status).toBe("pushing");
  });

  it("pushing -> done: pushes the worktree branch", async () => {
    seedEntry("pushing", { branchName: "yb/feat/fix_thing", worktreePath: "/tmp/wt" });

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    expect(git.push).toHaveBeenCalledWith("/tmp/wt", "yb/feat/fix_thing");
    expect(reload().status).toBe("done");
  });

  it("marks an entry failed and continues when a step throws", async () => {
    seedEntry("cloning");
    agent.chat.mockRejectedValue(new Error("agent exploded"));

    await buildKind().run(makeCtx(), { botUsername: "bot" });

    const after = reload();
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toBe("agent exploded");
  });
});
