import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
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
      filePath: "/tmp/ws/plan.md",
      status: "pending_review"
    });
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
