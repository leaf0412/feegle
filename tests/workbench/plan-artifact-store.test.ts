import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "../../src/app/runtime-db.js";
import { PlanArtifactStore } from "../../src/workbench/plan-artifact-store.js";

describe("PlanArtifactStore", () => {
  let home: string;
  let db: RuntimeDb;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-plan-artifact-"));
    db = openRuntimeDb(join(home, "feegle.db"));
  });

  afterEach(async () => {
    db.close();
    await rm(home, { recursive: true, force: true });
  });

  it("creates versioned plan artifacts and returns the latest version", () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-21T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_1",
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: "/repo/feegle",
      version: 1,
      filePath: "/tmp/plan-v1.md",
      status: "pending_review"
    });
    store.createVersion({
      planId: "plan_1",
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: "/repo/feegle",
      version: 2,
      filePath: "/tmp/plan-v2.md",
      feishuFileMessageId: "om_file_2",
      status: "pending_review",
      revisionNote: "Add verification"
    });

    expect(store.latest("plan_1")).toMatchObject({
      planId: "plan_1",
      version: 2,
      filePath: "/tmp/plan-v2.md",
      feishuFileMessageId: "om_file_2",
      revisionNote: "Add verification"
    });
  });

  it("marks a plan version status", () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-21T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_1",
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: "/repo/feegle",
      version: 1,
      filePath: "/tmp/plan-v1.md",
      status: "pending_review"
    });

    store.markStatus("plan_1", 1, "approved");

    expect(store.latest("plan_1")?.status).toBe("approved");
  });

  it("persists docToken and docUrl on createVersion and returns them via latest", () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-21T00:00:00.000Z"));

    store.createVersion({
      planId: "plan_doc_1",
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: "/repo",
      version: 1,
      filePath: "/tmp/plan-v1.md",
      docToken: "doxcn_abc",
      docUrl: "https://feishu.cn/docx/doxcn_abc",
      status: "pending_review"
    });

    const latest = store.latest("plan_doc_1");

    expect(latest?.docToken).toBe("doxcn_abc");
    expect(latest?.docUrl).toBe("https://feishu.cn/docx/doxcn_abc");
  });

  it("treats docToken and docUrl as optional for backwards compatibility", () => {
    const store = new PlanArtifactStore(db);

    store.createVersion({
      planId: "plan_doc_2",
      chatId: "oc_1",
      sourceMessageId: "om_1",
      provider: "codex",
      workspacePath: "/repo",
      version: 1,
      filePath: "/tmp/plan-v1.md",
      status: "pending_review"
    });

    const latest = store.latest("plan_doc_2");

    expect(latest?.docToken).toBeUndefined();
    expect(latest?.docUrl).toBeUndefined();
  });

  it("persists execution columns and reads them back", () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    const created = store.createVersion({
      planId: "plan_x",
      chatId: "oc_x",
      sourceMessageId: "om_x",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: "/tmp/ws/plan.md",
      status: "pending_review"
    });

    expect(created.executionIteration).toBe(1);
    expect(created.iterationNotes).toEqual([]);

    store.setBaseBranch("plan_x", {
      baseBranch: "main",
      headBranch: "yb/feat/x",
      expectedStatus: "pending_review"
    });
    store.setExecution("plan_x", {
      baseSha: "base_sha",
      headBranch: "yb/feat/x",
      worktreePath: "/tmp/wt",
      status: "executing",
      expectedStatus: "pending_review"
    });

    expect(store.latest("plan_x")).toMatchObject({
      baseBranch: "main",
      headBranch: "yb/feat/x",
      baseSha: "base_sha",
      worktreePath: "/tmp/wt",
      status: "executing"
    });
  });

  it("rejects status transitions that don't match expected status (first-wins guard)", () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_g",
      chatId: "oc_g",
      sourceMessageId: "om_g",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: "/tmp/ws/plan.md",
      status: "pending_review"
    });

    expect(() =>
      store.setStatus("plan_g", { status: "executing", expectedStatus: "approved" })
    ).toThrow(/state conflict/);
  });

  it("appends iteration notes as an ordered JSON array", () => {
    const store = new PlanArtifactStore(db, () => new Date("2026-05-22T00:00:00.000Z"));
    store.createVersion({
      planId: "plan_i",
      chatId: "oc_i",
      sourceMessageId: "om_i",
      provider: "codex",
      workspacePath: "/tmp/ws",
      version: 1,
      filePath: "/tmp/ws/plan.md",
      status: "pending_review"
    });
    store.appendIterationNote("plan_i", {
      iteration: 1,
      note: null,
      headShaBefore: null,
      headShaAfter: "sha1",
      commitCountDelta: 2,
      filesChangedDelta: 4,
      startedAt: "2026-05-22T01:00:00.000Z",
      completedAt: "2026-05-22T01:05:00.000Z"
    });
    store.appendIterationNote("plan_i", {
      iteration: 2,
      note: "增加错误处理",
      headShaBefore: "sha1",
      headShaAfter: "sha2",
      commitCountDelta: 1,
      filesChangedDelta: 2,
      startedAt: "2026-05-22T01:30:00.000Z",
      completedAt: "2026-05-22T01:32:00.000Z"
    });

    expect(store.latest("plan_i")?.iterationNotes).toEqual([
      expect.objectContaining({ iteration: 1, note: null }),
      expect.objectContaining({ iteration: 2, note: "增加错误处理" })
    ]);
    expect(store.latest("plan_i")?.executionIteration).toBe(2);
  });
});
