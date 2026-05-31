import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRuntimeDb, type RuntimeDb } from "@infra/app/runtime-db.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { RequirementWorkflowStore } from "@plugins/requirement-workflow/requirement-workflow-store.js";
import { RequirementPlanStore } from "@plugins/requirement-workflow/requirement-plan-store.js";
import { RequirementExecutionStore } from "@plugins/requirement-workflow/requirement-execution-store.js";
import { VerificationReportStore } from "@plugins/requirement-workflow/verification/verification-report-store.js";
import { requirementWorkflowRuntimeContribution } from "@plugins/requirement-workflow/requirement-workflow-runtime-contribution.js";
import type { RequirementPlanningAgent } from "@plugins/requirement-workflow/requirement-planning-service.js";
import type { RequirementExecutionGit } from "@plugins/requirement-workflow/requirement-execution-service.js";
import type { RequirementDevelopmentAgent } from "@plugins/requirement-workflow/requirement-execution-service.js";
import type { VerificationCommandRunner } from "@plugins/requirement-workflow/verification/verification-models.js";

function buildFakeGit(): RequirementExecutionGit {
  return {
    getRepoRoot: vi.fn().mockResolvedValue("/repo"),
    createWorktree: vi.fn().mockResolvedValue(undefined),
    diffStats: vi.fn().mockResolvedValue({ filesChanged: 1, insertions: 2, deletions: 0 })
  };
}

function buildFakeDevAgent(): RequirementDevelopmentAgent {
  return {
    runDevelopmentTask: vi.fn().mockResolvedValue({ exitCode: 0, summary: "done" })
  };
}

function buildPassingRunCommand(): VerificationCommandRunner {
  return vi.fn().mockResolvedValue({ exitCode: 0, stdout: "ok", stderr: "" });
}

function buildFailingRunCommand(): VerificationCommandRunner {
  return vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "Test failed" });
}

function buildTestContext(db: RuntimeDb, overrides?: { runCommand?: VerificationCommandRunner }) {
  const workflowStore = new RequirementWorkflowStore(db);
  const planStore = new RequirementPlanStore(db);
  const executionStore = new RequirementExecutionStore();
  const verificationReportStore = new VerificationReportStore();
  const runCommand = overrides?.runCommand ?? buildPassingRunCommand();

  const fakePlanningAgent: RequirementPlanningAgent = {
    runPlanGeneration: vi.fn().mockResolvedValue({ summary: "Plan summary", markdown: "# Plan\n- step 1" }),
    runPlanRevision: vi.fn().mockResolvedValue({ summary: "Revised", markdown: "# Plan revised\n- step 2" })
  };

  const fakeGit = buildFakeGit();
  const fakeDevAgent = buildFakeDevAgent();

  const workflowRegistry = new WorkflowRegistry();
  const intentResolvers = new IntentResolverRegistry();
  const workflowSelector = new WorkflowSelector();
  const effectHandlers = new EffectHandlerRegistry();

  requirementWorkflowRuntimeContribution(() => ({
    workflowStore,
    planStore,
    executionStore,
    planningAgent: fakePlanningAgent,
    git: fakeGit,
    devAgent: fakeDevAgent,
    verificationReportStore,
    runCommand,
    workspacePath: "/workspace",
    worktreeRoot: "/worktrees"
  })).register(new RuntimeContributionContext({ workflows: workflowRegistry, intentResolvers, workflowSelector, effectHandlers }));

  return {
    workflowStore,
    planStore,
    executionStore,
    verificationReportStore,
    effectHandlers,
    fakeGit,
    fakeDevAgent
  };
}

async function reachPlanApproved(
  effectHandlers: EffectHandlerRegistry,
  workflowStore: RequirementWorkflowStore,
  executionStore: RequirementExecutionStore
): Promise<string> {
  // Step 1: generate plan → reaches plan_reviewing
  const genResult = await effectHandlers.execute({
    effectId: "e-gen",
    pluginId: "requirement-workflow",
    effectType: "plan.generate",
    input: {
      workspaceId: "ws-test",
      projectId: null,
      conversationKey: "feishu:oc_test",
      requesterUserId: "user_1",
      requirementText: "Add login page"
    }
  }) as { requirementId: string; planVersion: number };

  const requirementId = genResult.requirementId;

  // Step 2: approve execution → reaches plan_approved; executionStore at "approved"
  await effectHandlers.execute({
    effectId: "e-approve",
    pluginId: "requirement-workflow",
    effectType: "execution.approve",
    input: {
      requirementId,
      planVersion: genResult.planVersion,
      requesterUserId: "user_1"
    }
  });

  expect(workflowStore.get(requirementId)?.status).toBe("plan_approved");
  expect(executionStore.latest(requirementId)?.status).toBe("approved");

  return requirementId;
}

describe("requirement-workflow execution/verification/acceptance handlers — happy path", () => {
  let root: string;
  let db: RuntimeDb;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "feegle-exec-handlers-"));
    db = openRuntimeDb(join(root, "runtime.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("registers all 8 business effect handlers when getDeps is provided", () => {
    const { effectHandlers } = buildTestContext(db);

    expect(effectHandlers.has("requirement-workflow", "plan.generate")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "plan.revise")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "execution.approve")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "execution.cancel")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "execution.revert_to_plan")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "execution.run")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "verification.run")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "acceptance.run")).toBe(true);
  });

  it("plan.revise sources the requirement text from the store when the card action omits it", async () => {
    const { workflowStore, planStore, effectHandlers } = buildTestContext(db);

    // generate first so a stored requirement (with its text) exists
    const gen = await effectHandlers.execute({
      effectId: "e-gen",
      pluginId: "requirement-workflow",
      effectType: "plan.generate",
      input: { workspaceId: "ws", projectId: null, conversationKey: "feishu:oc_1", requesterUserId: "u1", requirementText: "Add login page" }
    }) as { requirementId: string };

    // the 要求修改 card action carries only feedback — no requirementText
    const revised = await effectHandlers.execute({
      effectId: "e-revise",
      pluginId: "requirement-workflow",
      effectType: "plan.revise",
      input: { requirementId: gen.requirementId, feedback: "补充验收标准", requesterUserId: "u1" }
    }) as { requirementId: string; planVersion: number; summary: string };

    expect(revised.planVersion).toBe(2);
    expect(revised.summary).toBe("Revised");
    expect(planStore.latest(gen.requirementId)?.version).toBe(2);
    expect(workflowStore.get(gen.requirementId)?.status).toBe("plan_reviewing");
  });

  it("execution.revert_to_plan sends a developed requirement back to plan_reviewing and returns the latest plan", async () => {
    const { workflowStore, executionStore, effectHandlers } = buildTestContext(db);

    const requirementId = await reachPlanApproved(effectHandlers, workflowStore, executionStore);
    // develop it so the revert starts from a post-approve state, like the dev card 回退
    await effectHandlers.execute({
      effectId: "e-exec",
      pluginId: "requirement-workflow",
      effectType: "execution.run",
      input: { requirementId, requesterUserId: "user_1" }
    });
    expect(workflowStore.get(requirementId)?.status).toBe("implementation_ready");

    const reverted = await effectHandlers.execute({
      effectId: "e-back",
      pluginId: "requirement-workflow",
      effectType: "execution.revert_to_plan",
      input: { requirementId }
    }) as { requirementId: string; planVersion: number; summary: string; markdown: string };

    expect(workflowStore.get(requirementId)?.status).toBe("plan_reviewing");
    expect(reverted).toMatchObject({ requirementId, planVersion: 1, summary: "Plan summary" });
    expect(reverted.markdown).toContain("# Plan");
  });

  it("execution.run transitions plan_approved→executing→implementation_ready and drives executionStore", async () => {
    const { workflowStore, executionStore, effectHandlers, fakeGit, fakeDevAgent } = buildTestContext(db);

    const requirementId = await reachPlanApproved(effectHandlers, workflowStore, executionStore);

    const execResult = await effectHandlers.execute({
      effectId: "e-exec",
      pluginId: "requirement-workflow",
      effectType: "execution.run",
      input: { requirementId, requesterUserId: "user_1" }
    }) as { requirementId: string; status: string };

    expect(execResult.requirementId).toBe(requirementId);
    expect(execResult.status).toBe("implementation_ready");

    expect(workflowStore.get(requirementId)?.status).toBe("implementation_ready");

    const execRecord = executionStore.latest(requirementId);
    expect(execRecord?.status).toBe("implementation_ready");
    expect(execRecord?.worktreePath).toBeDefined();

    expect(fakeGit.getRepoRoot).toHaveBeenCalledWith("/workspace");
    expect(fakeGit.createWorktree).toHaveBeenCalledOnce();
    expect(fakeDevAgent.runDevelopmentTask).toHaveBeenCalledOnce();
    expect(fakeGit.diffStats).toHaveBeenCalledOnce();
  });

  it("verification.run transitions implementation_ready→verifying→implementation_ready (passed) and saves report", async () => {
    const { workflowStore, executionStore, verificationReportStore, effectHandlers } = buildTestContext(db);

    const requirementId = await reachPlanApproved(effectHandlers, workflowStore, executionStore);

    await effectHandlers.execute({
      effectId: "e-exec",
      pluginId: "requirement-workflow",
      effectType: "execution.run",
      input: { requirementId, requesterUserId: "user_1" }
    });

    const verifyResult = await effectHandlers.execute({
      effectId: "e-verify",
      pluginId: "requirement-workflow",
      effectType: "verification.run",
      input: { requirementId }
    }) as { requirementId: string; status: string };

    expect(verifyResult.requirementId).toBe(requirementId);
    expect(verifyResult.status).toBe("passed");

    expect(workflowStore.get(requirementId)?.status).toBe("implementation_ready");

    const report = verificationReportStore.latest(requirementId);
    expect(report).toBeDefined();
    expect(report?.status).toBe("passed");
    expect(report?.checks).toHaveLength(1);
    expect(report?.checks[0].id).toBe("test");
  });

  it("acceptance.run transitions implementation_ready→accepted after passed verification", async () => {
    const { workflowStore, executionStore, effectHandlers } = buildTestContext(db);

    const requirementId = await reachPlanApproved(effectHandlers, workflowStore, executionStore);

    await effectHandlers.execute({
      effectId: "e-exec",
      pluginId: "requirement-workflow",
      effectType: "execution.run",
      input: { requirementId, requesterUserId: "user_1" }
    });

    await effectHandlers.execute({
      effectId: "e-verify",
      pluginId: "requirement-workflow",
      effectType: "verification.run",
      input: { requirementId }
    });

    const acceptResult = await effectHandlers.execute({
      effectId: "e-accept",
      pluginId: "requirement-workflow",
      effectType: "acceptance.run",
      input: { requirementId }
    }) as { requirementId: string; status: string };

    expect(acceptResult.requirementId).toBe(requirementId);
    expect(acceptResult.status).toBe("accepted");

    expect(workflowStore.get(requirementId)?.status).toBe("accepted");
  });
});

describe("requirement-workflow verification failure path", () => {
  let root: string;
  let db: RuntimeDb;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "feegle-exec-fail-"));
    db = openRuntimeDb(join(root, "runtime.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("verification.run sets status to failed when tests fail", async () => {
    const { workflowStore, executionStore, verificationReportStore, effectHandlers } =
      buildTestContext(db, { runCommand: buildFailingRunCommand() });

    const requirementId = await reachPlanApproved(effectHandlers, workflowStore, executionStore);

    await effectHandlers.execute({
      effectId: "e-exec",
      pluginId: "requirement-workflow",
      effectType: "execution.run",
      input: { requirementId, requesterUserId: "user_1" }
    });

    const verifyResult = await effectHandlers.execute({
      effectId: "e-verify",
      pluginId: "requirement-workflow",
      effectType: "verification.run",
      input: { requirementId }
    }) as { status: string };

    expect(verifyResult.status).toBe("failed");
    expect(workflowStore.get(requirementId)?.status).toBe("failed");

    const report = verificationReportStore.latest(requirementId);
    expect(report?.status).toBe("failed");
  });

  it("acceptance.run throws REQUIREMENT_NOT_VERIFIED when verification failed", async () => {
    const { workflowStore, executionStore, effectHandlers } =
      buildTestContext(db, { runCommand: buildFailingRunCommand() });

    const requirementId = await reachPlanApproved(effectHandlers, workflowStore, executionStore);

    await effectHandlers.execute({
      effectId: "e-exec",
      pluginId: "requirement-workflow",
      effectType: "execution.run",
      input: { requirementId, requesterUserId: "user_1" }
    });

    await effectHandlers.execute({
      effectId: "e-verify",
      pluginId: "requirement-workflow",
      effectType: "verification.run",
      input: { requirementId }
    });

    // workflow is now "failed"; acceptance.run checks report status, not workflow status
    await expect(
      effectHandlers.execute({
        effectId: "e-accept",
        pluginId: "requirement-workflow",
        effectType: "acceptance.run",
        input: { requirementId }
      })
    ).rejects.toThrow(`REQUIREMENT_NOT_VERIFIED: ${requirementId}`);
  });

  it("acceptance.run throws REQUIREMENT_NOT_VERIFIED when no verification report exists", async () => {
    const { workflowStore, executionStore, effectHandlers } = buildTestContext(db);

    const requirementId = await reachPlanApproved(effectHandlers, workflowStore, executionStore);

    await effectHandlers.execute({
      effectId: "e-exec",
      pluginId: "requirement-workflow",
      effectType: "execution.run",
      input: { requirementId, requesterUserId: "user_1" }
    });

    // Skip verification.run entirely
    await expect(
      effectHandlers.execute({
        effectId: "e-accept",
        pluginId: "requirement-workflow",
        effectType: "acceptance.run",
        input: { requirementId }
      })
    ).rejects.toThrow(`REQUIREMENT_NOT_VERIFIED: ${requirementId}`);
  });
});

describe("requirementWorkflowRuntimeContribution — backward-compat (no getDeps)", () => {
  it("does NOT register execution/verification/acceptance handlers when called with no args", () => {
    const workflowRegistry = new WorkflowRegistry();
    const intentResolvers = new IntentResolverRegistry();
    const workflowSelector = new WorkflowSelector();
    const effectHandlers = new EffectHandlerRegistry();

    requirementWorkflowRuntimeContribution().register(
      new RuntimeContributionContext({ workflows: workflowRegistry, intentResolvers, workflowSelector, effectHandlers })
    );

    expect(effectHandlers.has("requirement-workflow", "execution.run")).toBe(false);
    expect(effectHandlers.has("requirement-workflow", "verification.run")).toBe(false);
    expect(effectHandlers.has("requirement-workflow", "acceptance.run")).toBe(false);
  });
});
