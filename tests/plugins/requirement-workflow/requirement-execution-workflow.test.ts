import { describe, expect, it } from "vitest";
import { WorkflowSelector } from "@core/ingress/workflow-selector.js";
import { WorkflowRegistry } from "@core/runtime/workflow-registry.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";
import { EffectHandlerRegistry } from "@core/runtime/effect-handler-registry.js";
import { RuntimeContributionContext } from "@core/runtime/runtime-contribution-context.js";
import { requirementWorkflowRuntimeContribution } from "@plugins/requirement-workflow/requirement-workflow-runtime-contribution.js";

function buildWorkflows() {
  const workflows = new WorkflowRegistry();
  requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
    workflows,
    intentResolvers: new IntentResolverRegistry(),
    workflowSelector: new WorkflowSelector(),
    effectHandlers: new EffectHandlerRegistry()
  }));
  return workflows;
}

describe("requirement execution workflow selectors", () => {
  it("routes the approve intent to the approve workflow (which now also develops)", () => {
    const selector = new WorkflowSelector();
    requirementWorkflowRuntimeContribution().register({
      workflowSelector: selector,
      workflows: { register: () => undefined },
      intentResolvers: { register: () => undefined },
      effectHandlers: { register: () => undefined }
    } as never);

    expect(selector.select({
      intentId: "intent_approve",
      kind: "requirement_plan_approve",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1", planVersion: 1 }
    }).definitionId).toBe("requirement.plan.approve.workflow");
  });

  it("registers the approve workflow and no longer registers a standalone execute workflow", () => {
    const workflows = buildWorkflows();
    expect(() => workflows.require("requirement.plan.approve.workflow")).not.toThrow();
    expect(() => workflows.require("requirement.execute.workflow")).toThrow();
  });
});

describe("requirement.plan.approve.workflow step (approve → develop on one card)", () => {
  it("approves, renders 开发中, runs development, then renders the completed dev card", async () => {
    const workflows = buildWorkflows();
    const runOutput = { status: "implementation_ready", worktreePath: "/tmp/wt" };
    const executed: Array<{ pluginId: string; effectType: string; input: Record<string, unknown> }> = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", planVersion: 3, sourcePlugin: "feishu", chatId: "oc_1", cardMessageId: "om_card" },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executed.push({ pluginId: e.pluginId, effectType: e.effectType, input: e.input as Record<string, unknown> });
        if (e.effectType === "execution.run") return runOutput;
        return {};
      }
    };

    const result = await workflows.require("requirement.plan.approve.workflow").steps[0].run(stepCtx as never);

    expect(result).toEqual({ kind: "complete", output: runOutput });
    // approve → render(开发中) → run → render(完成) — no separate 执行开发 button
    expect(executed.map((e) => e.effectType)).toEqual([
      "execution.approve",
      "requirement.execution_progress.render",
      "execution.run",
      "requirement.execution_progress.render"
    ]);
    expect(executed[1]).toMatchObject({ pluginId: "feishu", input: { phase: "developing" } });
    expect(executed[3]).toMatchObject({ pluginId: "feishu", input: { phase: "completed", result: runOutput } });
  });

  it("renders the failed dev card and rethrows when development throws — the card never stays on 开发中", async () => {
    const workflows = buildWorkflows();
    const executed: Array<{ effectType: string; input: Record<string, unknown> }> = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", planVersion: 1, sourcePlugin: "feishu", chatId: "oc_1" },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executed.push({ effectType: e.effectType, input: e.input as Record<string, unknown> });
        if (e.effectType === "execution.run") throw new Error("no git repo at workspace");
        return {};
      }
    };

    await expect(workflows.require("requirement.plan.approve.workflow").steps[0].run(stepCtx as never)).rejects.toThrow(
      "no git repo at workspace"
    );

    expect(executed.map((e) => e.effectType)).toEqual([
      "execution.approve",
      "requirement.execution_progress.render",
      "execution.run",
      "requirement.execution_progress.render"
    ]);
    expect(executed[3].input).toMatchObject({ phase: "failed", error: "no git repo at workspace" });
  });

  it("skips renders when sourcePlugin is absent (still approves and runs)", async () => {
    const workflows = buildWorkflows();
    const executed: string[] = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", planVersion: 1 },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executed.push(e.effectType);
        return {};
      }
    };

    await workflows.require("requirement.plan.approve.workflow").steps[0].run(stepCtx as never);

    expect(executed).toEqual(["execution.approve", "execution.run"]);
  });
});

describe("requirement.cancel.workflow step (取消 → 锁卡)", () => {
  it("cancels then renders the locked cancelled card in place", async () => {
    const workflows = buildWorkflows();
    const executed: string[] = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", sourcePlugin: "feishu", chatId: "oc_1", cardMessageId: "om_card" },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executed.push(e.effectType);
        return {};
      }
    };

    await workflows.require("requirement.cancel.workflow").steps[0].run(stepCtx as never);

    // a terminal action must update the card so it can't be re-clicked
    expect(executed).toEqual(["execution.cancel", "requirement.cancelled.render"]);
  });
});

describe("requirement.plan.revise.workflow step (要求修改 → 重渲染计划卡)", () => {
  it("revises then re-renders the plan-review card in place with the new version", async () => {
    const workflows = buildWorkflows();
    const revised = { requirementId: "reqwf_1", planVersion: 2, markdown: "# Plan v2", summary: "S2" };
    const executed: Array<{ effectType: string; input: Record<string, unknown> }> = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", planVersion: 1, feedback: "补充验收标准", sourcePlugin: "feishu", chatId: "oc_1", cardMessageId: "om_card" },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executed.push({ effectType: e.effectType, input: e.input as Record<string, unknown> });
        if (e.effectType === "plan.revise") return revised;
        return {};
      }
    };

    await workflows.require("requirement.plan.revise.workflow").steps[0].run(stepCtx as never);

    expect(executed.map((e) => e.effectType)).toEqual(["plan.revise", "requirement.plan_review.render"]);
    // a revision is a new plan → new cloud doc, so no docUrl is carried forward
    expect(executed[1].input).toMatchObject({ planVersion: 2, summary: "S2", docUrl: undefined });
  });
});

describe("requirement.plan.back.workflow step (回退到计划)", () => {
  it("routes the back intent and reverts to plan, re-rendering plan_review with the carried docUrl", async () => {
    const selector = new WorkflowSelector();
    const workflows = new WorkflowRegistry();
    requirementWorkflowRuntimeContribution().register(new RuntimeContributionContext({
      workflows,
      intentResolvers: new IntentResolverRegistry(),
      workflowSelector: selector,
      effectHandlers: new EffectHandlerRegistry()
    }));

    expect(selector.select({
      intentId: "intent_back",
      kind: "requirement_plan_back",
      workspaceId: "workspace-default",
      projectId: null,
      actor: { kind: "user", userId: "user_1" },
      payload: { requirementId: "reqwf_1" }
    }).definitionId).toBe("requirement.plan.back.workflow");

    const reverted = { requirementId: "reqwf_1", planVersion: 2, summary: "S", markdown: "# Plan" };
    const executed: Array<{ pluginId: string; effectType: string; input: Record<string, unknown> }> = [];
    const stepCtx = {
      input: { requirementId: "reqwf_1", planVersion: 2, sourcePlugin: "feishu", chatId: "oc_1", cardMessageId: "om_card", docUrl: "https://feishu.cn/docx/doc_1" },
      executeEffect: async (e: { pluginId: string; effectType: string; input: unknown }) => {
        executed.push({ pluginId: e.pluginId, effectType: e.effectType, input: e.input as Record<string, unknown> });
        if (e.effectType === "execution.revert_to_plan") return reverted;
        return {};
      }
    };

    await workflows.require("requirement.plan.back.workflow").steps[0].run(stepCtx as never);

    expect(executed.map((e) => e.effectType)).toEqual(["execution.revert_to_plan", "requirement.plan_review.render"]);
    // the re-render carries docUrl so the renderer reuses the existing cloud doc
    expect(executed[1]).toMatchObject({
      pluginId: "feishu",
      input: { docUrl: "https://feishu.cn/docx/doc_1", summary: "S", planVersion: 2 }
    });
  });
});
