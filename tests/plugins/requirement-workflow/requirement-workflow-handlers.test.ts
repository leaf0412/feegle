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
import { requirementWorkflowRuntimeContribution } from "@plugins/requirement-workflow/requirement-workflow-runtime-contribution.js";
import type { RequirementPlanningAgent } from "@plugins/requirement-workflow/requirement-planning-service.js";

function buildTestRegistries(db: RuntimeDb) {
  const workflowStore = new RequirementWorkflowStore(db);
  const planStore = new RequirementPlanStore(db);
  const executionStore = new RequirementExecutionStore();

  const fakePlanningAgent: RequirementPlanningAgent = {
    runPlanGeneration: vi.fn().mockResolvedValue({ summary: "S", markdown: "# Plan\n- x" }),
    runPlanRevision: vi.fn().mockResolvedValue({ summary: "S2", markdown: "# Plan revised\n- y" })
  };

  const workflowRegistry = new WorkflowRegistry();
  const intentResolvers = new IntentResolverRegistry();
  const workflowSelector = new WorkflowSelector();
  const effectHandlers = new EffectHandlerRegistry();

  return { workflowStore, planStore, executionStore, fakePlanningAgent, workflowRegistry, intentResolvers, workflowSelector, effectHandlers };
}

describe("requirementWorkflowRuntimeContribution — with getDeps", () => {
  let root: string;
  let db: RuntimeDb;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "feegle-rwh-"));
    db = openRuntimeDb(join(root, "runtime.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("registers all 4 business effect handlers when getDeps is provided", () => {
    const { workflowStore, planStore, executionStore, fakePlanningAgent, workflowRegistry, intentResolvers, workflowSelector, effectHandlers } =
      buildTestRegistries(db);

    requirementWorkflowRuntimeContribution(() => ({
      workflowStore,
      planStore,
      executionStore,
      planningAgent: fakePlanningAgent
    })).register(new RuntimeContributionContext({ workflows: workflowRegistry, intentResolvers, workflowSelector, effectHandlers }));

    expect(effectHandlers.has("requirement-workflow", "plan.generate")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "plan.revise")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "execution.approve")).toBe(true);
    expect(effectHandlers.has("requirement-workflow", "execution.cancel")).toBe(true);
  });

  it("plan.generate creates intake, runs planning, transitions to plan_reviewing, returns version info", async () => {
    const { workflowStore, planStore, executionStore, fakePlanningAgent, workflowRegistry, intentResolvers, workflowSelector, effectHandlers } =
      buildTestRegistries(db);

    requirementWorkflowRuntimeContribution(() => ({
      workflowStore,
      planStore,
      executionStore,
      planningAgent: fakePlanningAgent
    })).register(new RuntimeContributionContext({ workflows: workflowRegistry, intentResolvers, workflowSelector, effectHandlers }));

    const result = await effectHandlers.execute({
      effectId: "e1",
      pluginId: "requirement-workflow",
      effectType: "plan.generate",
      input: {
        workspaceId: "ws",
        projectId: null,
        conversationKey: "feishu:oc_test",
        requesterUserId: "u1",
        requirementText: "需求文档：做个登录页\n更多细节"
      }
    }) as { requirementId: string; planVersion: number; markdown: string; summary: string };

    expect(result.requirementId).toMatch(/^reqwf_/);
    expect(result.planVersion).toBe(1);
    expect(result.markdown).toBe("# Plan\n- x");
    expect(result.summary).toBe("S");

    const record = workflowStore.get(result.requirementId);
    expect(record).toBeDefined();
    expect(record?.status).toBe("plan_reviewing");

    const latest = planStore.latest(result.requirementId);
    expect(latest).toBeDefined();
    expect(latest?.version).toBe(1);

    expect(fakePlanningAgent.runPlanGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ requirementText: "需求文档：做个登录页\n更多细节" })
    );
  });

  it("execution.approve after plan.generate transitions to plan_approved and records execution", async () => {
    const { workflowStore, planStore, executionStore, fakePlanningAgent, workflowRegistry, intentResolvers, workflowSelector, effectHandlers } =
      buildTestRegistries(db);

    requirementWorkflowRuntimeContribution(() => ({
      workflowStore,
      planStore,
      executionStore,
      planningAgent: fakePlanningAgent
    })).register(new RuntimeContributionContext({ workflows: workflowRegistry, intentResolvers, workflowSelector, effectHandlers }));

    // Step 1: generate plan to reach plan_reviewing
    const genResult = await effectHandlers.execute({
      effectId: "e2",
      pluginId: "requirement-workflow",
      effectType: "plan.generate",
      input: {
        workspaceId: "ws",
        projectId: null,
        conversationKey: "feishu:oc_test",
        requesterUserId: "u1",
        requirementText: "做登录页"
      }
    }) as { requirementId: string; planVersion: number };

    // Step 2: approve execution
    const approveResult = await effectHandlers.execute({
      effectId: "e3",
      pluginId: "requirement-workflow",
      effectType: "execution.approve",
      input: {
        requirementId: genResult.requirementId,
        planVersion: genResult.planVersion,
        requesterUserId: "u1"
      }
    }) as { requirementId: string; status: string };

    expect(approveResult.requirementId).toBe(genResult.requirementId);
    expect(approveResult.status).toBe("plan_approved");

    expect(workflowStore.get(genResult.requirementId)?.status).toBe("plan_approved");

    const execRecord = executionStore.latest(genResult.requirementId);
    expect(execRecord).toBeDefined();
    expect(execRecord?.status).toBe("approved");
  });
});

describe("requirementWorkflowRuntimeContribution — without getDeps (backward-compat)", () => {
  it("does NOT register business effect handlers when called with no args", () => {
    const workflowRegistry = new WorkflowRegistry();
    const intentResolvers = new IntentResolverRegistry();
    const workflowSelector = new WorkflowSelector();
    const effectHandlers = new EffectHandlerRegistry();

    requirementWorkflowRuntimeContribution().register(
      new RuntimeContributionContext({ workflows: workflowRegistry, intentResolvers, workflowSelector, effectHandlers })
    );

    expect(effectHandlers.has("requirement-workflow", "plan.generate")).toBe(false);
    expect(effectHandlers.has("requirement-workflow", "plan.revise")).toBe(false);
    expect(effectHandlers.has("requirement-workflow", "execution.approve")).toBe(false);
    expect(effectHandlers.has("requirement-workflow", "execution.cancel")).toBe(false);
  });

  it("still registers all selectors even without getDeps", () => {
    const workflowRegistry = new WorkflowRegistry();
    const intentResolvers = new IntentResolverRegistry();
    const workflowSelector = new WorkflowSelector();
    const effectHandlers = new EffectHandlerRegistry();

    requirementWorkflowRuntimeContribution().register(
      new RuntimeContributionContext({ workflows: workflowRegistry, intentResolvers, workflowSelector, effectHandlers })
    );

    // Selectors must still resolve
    expect(workflowSelector.select({
      intentId: "i1",
      kind: "requirement_intake",
      workspaceId: "ws",
      projectId: null,
      actor: { kind: "user", userId: "u1" },
      payload: {}
    }).definitionId).toBe("requirement.intake.workflow");

    expect(workflowSelector.select({
      intentId: "i2",
      kind: "requirement_plan_generate",
      workspaceId: "ws",
      projectId: null,
      actor: { kind: "user", userId: "u1" },
      payload: {}
    }).definitionId).toBe("requirement.plan.generate.workflow");
  });
});
