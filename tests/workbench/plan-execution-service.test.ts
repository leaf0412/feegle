import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { PlanArtifactStore } from "../../src/workbench/plan-artifact-store.js";
import { PlanExecutionService } from "../../src/workbench/plan-execution-service.js";

describe("PlanExecutionService.approve — no base branch", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-plan-exec-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("transitions pending_review -> pending_base and replies with BaseBranchPromptCard", async () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_1",
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: join(home, "plan_1.md"),
      status: "pending_review"
    });
    await writeFile(join(home, "plan_1.md"), "# Plan\n\n- step", "utf8");
    const sentCards: Array<{ chatId: string; card: unknown }> = [];

    const service = new PlanExecutionService({
      feegleHome: home,
      client: {
        sendInteractiveCard: async (chatId, card) => {
          sentCards.push({ chatId, card });
          return "msg_progress_1";
        },
        updateInteractiveCard: async () => undefined
      },
      store,
      git: {
        getRepoRoot: async () => "/tmp/ws",
        listRemoteBranches: async () => ["main", "beta"],
        getBranchSha: async () => "base_sha",
        branchExists: async () => true,
        createWorktree: async () => undefined,
        removeWorktree: async () => undefined,
        isClean: async () => true,
        diffStats: async () => ({ commitCount: 0, filesChanged: 0 }),
        push: async () => undefined
      } as any,
      agent: { runDevelopmentTask: async () => "ok" } as any
    });

    const reply = await service.approve("plan_1");

    expect(store.latest("plan_1")?.status).toBe("pending_base");
    expect(reply).toBeDefined();
    expect((reply as any).kind).toBe("feishu_card");
    const json = JSON.stringify((reply as any).card);
    expect(json).toContain("act:/workbench plan base_branch_submit");
    expect(json).toContain("main");
    expect(json).toContain("beta");
    expect(sentCards).toHaveLength(0);
  });

  it("rejects approve on terminal status", async () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_2",
      chatId: "oc_2",
      sourceMessageId: "om_2",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: "/tmp/ws/plan.md",
      status: "pushed"
    });
    const service = new PlanExecutionService({
      feegleHome: home,
      client: { sendInteractiveCard: async () => "x", updateInteractiveCard: async () => undefined },
      store,
      git: {} as any,
      agent: {} as any
    });

    const reply = await service.approve("plan_2");

    expect((reply as any).kind).toBe("text");
    expect((reply as any).text).toContain("已结束");
  });
});

describe("PlanExecutionService.submitBaseBranch", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-plan-exec-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("validates base branch and creates worktree, transitioning to executing", async () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_1",
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: join(home, "plan_1.md"),
      status: "pending_review"
    });
    await writeFile(join(home, "plan_1.md"), "# Plan\n\n- step", "utf8");
    store.setStatus("plan_1", { status: "pending_base", expectedStatus: "pending_review" });

    const calls = {
      createWorktree: [] as Array<Record<string, string>>,
      sentCards: [] as unknown[]
    };
    let runIterationCalled = false;

    const service = new PlanExecutionService({
      feegleHome: home,
      client: {
        sendInteractiveCard: async (_chatId, card) => {
          calls.sentCards.push(card);
          return "msg_progress_1";
        },
        updateInteractiveCard: async () => undefined
      },
      store,
      git: {
        getRepoRoot: async () => "/tmp/ws",
        listRemoteBranches: async () => ["main", "beta"],
        getBranchSha: async () => "base_sha_abc",
        branchExists: async () => false,
        createWorktree: async (input: Record<string, string>) => {
          calls.createWorktree.push(input as any);
        },
        removeWorktree: async () => undefined,
        isClean: async () => true,
        diffStats: async () => ({ commitCount: 0, filesChanged: 0 }),
        push: async () => undefined
      } as any,
      agent: {
        runDevelopmentTask: async () => {
          runIterationCalled = true;
          return "ok";
        }
      } as any
    });

    await service.submitBaseBranch({
      planId: "plan_1",
      baseBranch: "main",
      headBranch: "yb/feat/custom"
    });
    await new Promise((r) => setTimeout(r, 50));

    const latest = store.latest("plan_1");
    expect(latest?.baseBranch).toBe("main");
    expect(latest?.headBranch).toBe("yb/feat/custom");
    expect(latest?.baseSha).toBe("base_sha_abc");
    expect(latest?.worktreePath).toContain("plan_1");
    expect(["executing", "completed"]).toContain(latest?.status);
    expect(calls.createWorktree[0]).toMatchObject({
      worktreePath: latest?.worktreePath,
      baseBranch: "main",
      newBranch: "yb/feat/custom"
    });
    expect(calls.sentCards).toHaveLength(1);
    expect(JSON.stringify(calls.sentCards[0])).toContain("yb/feat/custom");
    expect(runIterationCalled).toBe(true);
  });

  it("rejects base branch not in remote list", async () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_2",
      chatId: "oc_2",
      sourceMessageId: "om_2",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: "/tmp/ws/plan.md",
      status: "pending_review"
    });
    store.setStatus("plan_2", { status: "pending_base", expectedStatus: "pending_review" });

    const service = new PlanExecutionService({
      feegleHome: home,
      client: {
        sendInteractiveCard: async () => "x",
        updateInteractiveCard: async () => undefined
      },
      store,
      git: {
        getRepoRoot: async () => "/tmp/ws",
        listRemoteBranches: async () => ["main", "beta"],
        getBranchSha: async () => "x",
        branchExists: async () => false,
        createWorktree: async () => undefined,
        removeWorktree: async () => undefined,
        isClean: async () => true,
        diffStats: async () => ({ commitCount: 0, filesChanged: 0 }),
        push: async () => undefined
      } as any,
      agent: { runDevelopmentTask: async () => "" } as any
    });

    const reply = await service.submitBaseBranch({
      planId: "plan_2",
      baseBranch: "nonexistent"
    });

    expect(store.latest("plan_2")?.status).toBe("pending_base");
    expect((reply as any).kind).toBe("feishu_card");
    const json = JSON.stringify((reply as any).card);
    expect(json).toContain("不在远程分支列表");
    expect(json).toContain("act:/workbench plan base_branch_submit");
  });
});

describe("PlanExecutionService.runIteration (first execution)", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-plan-exec-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  async function setupRunningPlan(store: PlanArtifactStore) {
    store.createVersion({
      planId: "plan_e",
      chatId: "oc_e",
      sourceMessageId: "om_e",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: join(home, "plan_e.md"),
      status: "pending_review"
    });
    await writeFile(join(home, "plan_e.md"), "# Plan\n\n- step 1", "utf8");
    store.setStatus("plan_e", { status: "pending_base", expectedStatus: "pending_review" });
  }

  it("agent succeeds + working tree clean -> status=completed and CompletedCard updated", async () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    await setupRunningPlan(store);

    const updates: unknown[] = [];

    const service = new PlanExecutionService({
      feegleHome: home,
      client: {
        sendInteractiveCard: async () => "msg_progress",
        updateInteractiveCard: async (_msgId, card) => {
          updates.push(card);
        }
      },
      store,
      git: {
        getRepoRoot: async () => "/tmp/ws",
        listRemoteBranches: async () => ["main"],
        getBranchSha: async (_repo: string, branch: string) => (branch === "main" ? "base_sha" : "head_sha_after"),
        branchExists: async () => true,
        createWorktree: async () => undefined,
        removeWorktree: async () => undefined,
        isClean: async () => true,
        diffStats: async () => ({ commitCount: 3, filesChanged: 7 }),
        push: async () => undefined
      } as any,
      agent: {
        runDevelopmentTask: async (_req: unknown, _repo: unknown, _task: string, opts: any) => {
          await opts?.onProgress?.({ kind: "info", text: "reading src/app.ts" });
          await opts?.onProgress?.({ kind: "tool_use", text: "Edit src/app.ts" });
          return "done";
        }
      } as any
    });

    await service.submitBaseBranch({ planId: "plan_e", baseBranch: "main" });
    await new Promise((r) => setTimeout(r, 50));

    const latest = store.latest("plan_e");
    expect(latest?.status).toBe("completed");
    expect(latest?.headSha).toBe("head_sha_after");
    expect(latest?.commitCount).toBe(3);
    expect(latest?.filesChanged).toBe(7);
    expect(latest?.iterationNotes).toHaveLength(1);
    expect(latest?.iterationNotes[0]).toMatchObject({
      iteration: 1,
      note: null,
      headShaAfter: "head_sha_after",
      commitCountDelta: 3,
      filesChangedDelta: 7
    });
    const lastCard = JSON.stringify(updates.at(-1));
    expect(lastCard).toContain("act:/workbench plan revise_execution");
    expect(lastCard).toContain("act:/workbench plan push");
  });

  it("agent exits but working tree dirty -> status=failed with error message", async () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    await setupRunningPlan(store);

    const service = new PlanExecutionService({
      feegleHome: home,
      client: {
        sendInteractiveCard: async () => "msg",
        updateInteractiveCard: async () => undefined
      },
      store,
      git: {
        getRepoRoot: async () => "/tmp/ws",
        listRemoteBranches: async () => ["main"],
        getBranchSha: async () => "x",
        branchExists: async () => true,
        createWorktree: async () => undefined,
        removeWorktree: async () => undefined,
        isClean: async () => false,
        diffStats: async () => ({ commitCount: 0, filesChanged: 0 }),
        push: async () => undefined
      } as any,
      agent: { runDevelopmentTask: async () => "done" } as any
    });

    await service.submitBaseBranch({ planId: "plan_e", baseBranch: "main" });
    await new Promise((r) => setTimeout(r, 50));

    const latest = store.latest("plan_e");
    expect(latest?.status).toBe("failed");
    expect(latest?.errorMessage).toContain("working tree dirty");
  });
});
