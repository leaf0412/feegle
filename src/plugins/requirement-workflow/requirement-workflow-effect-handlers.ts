import type { EffectHandler } from "@core/runtime/effect-handler-registry.js";
import type { RequirementWorkflowStore } from "./requirement-workflow-store.js";
import type { RequirementPlanStore } from "./requirement-plan-store.js";
import type { RequirementExecutionStore } from "./requirement-execution-store.js";
import type { RequirementPlanningAgent } from "./requirement-planning-service.js";
import { RequirementPlanningService } from "./requirement-planning-service.js";
import type { RequirementExecutionGit } from "./requirement-execution-service.js";
import { RequirementExecutionService } from "./requirement-execution-service.js";
import type { RequirementDevelopmentAgent } from "./requirement-execution-service.js";
import type { VerificationReportStore } from "./verification/verification-report-store.js";
import type { VerificationCommandRunner } from "./verification/verification-models.js";
import { VerificationRunner } from "./verification/verification-runner.js";

export interface RequirementWorkflowHandlerDeps {
  workflowStore: RequirementWorkflowStore;
  planStore: RequirementPlanStore;
  executionStore: RequirementExecutionStore;
  planningAgent: RequirementPlanningAgent;
  git: RequirementExecutionGit;
  devAgent: RequirementDevelopmentAgent;
  verificationReportStore: VerificationReportStore;
  runCommand: VerificationCommandRunner;
  workspacePath: string;
  worktreeRoot: string;
}

const TITLE_MAX_LENGTH = 60;

function deriveTitleFromRequirementText(requirementText: string): string {
  const firstNonEmptyLine = requirementText
    .split("\n")
    .find((line) => line.trim().length > 0) ?? "";
  return firstNonEmptyLine.trim().slice(0, TITLE_MAX_LENGTH);
}

export function buildPlanGenerateHandler(deps: RequirementWorkflowHandlerDeps): EffectHandler {
  return {
    pluginId: "requirement-workflow",
    effectType: "plan.generate",
    async execute(effect) {
      const input = effect.input as {
        workspaceId: string;
        projectId: string | null;
        conversationKey: string;
        requesterUserId: string;
        requirementText: string;
        sourcePlugin?: string;
        chatId?: string;
        messageId?: string;
      };

      const title = deriveTitleFromRequirementText(input.requirementText);

      const record = deps.workflowStore.createIntake({
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        conversationKey: input.conversationKey,
        requesterUserId: input.requesterUserId,
        title,
        requirementText: input.requirementText
      });

      const { requirementId } = record;

      deps.workflowStore.setStatus({
        requirementId,
        expected: "intake_received",
        next: "planning"
      });

      const planningService = new RequirementPlanningService({
        planStore: deps.planStore,
        agent: deps.planningAgent
      });

      const version = await planningService.generatePlan({
        requirementId,
        requesterUserId: input.requesterUserId,
        requirementText: input.requirementText
      });

      deps.workflowStore.setStatus({
        requirementId,
        expected: "planning",
        next: "plan_reviewing"
      });

      return {
        requirementId,
        planVersion: version.version,
        markdown: version.markdown,
        summary: version.summary
      };
    }
  };
}

export function buildPlanReviseHandler(deps: RequirementWorkflowHandlerDeps): EffectHandler {
  return {
    pluginId: "requirement-workflow",
    effectType: "plan.revise",
    async execute(effect) {
      const input = effect.input as {
        requirementId: string;
        requirementText: string;
        feedback: string;
        requesterUserId: string;
      };

      const planningService = new RequirementPlanningService({
        planStore: deps.planStore,
        agent: deps.planningAgent
      });

      const version = await planningService.revisePlan({
        requirementId: input.requirementId,
        requesterUserId: input.requesterUserId,
        requirementText: input.requirementText,
        feedback: input.feedback
      });

      return {
        requirementId: input.requirementId,
        planVersion: version.version,
        markdown: version.markdown
      };
    }
  };
}

export function buildExecutionApproveHandler(deps: RequirementWorkflowHandlerDeps): EffectHandler {
  return {
    pluginId: "requirement-workflow",
    effectType: "execution.approve",
    execute(effect) {
      const input = effect.input as {
        requirementId: string;
        planVersion: number;
        requesterUserId: string;
      };

      deps.executionStore.createPendingExecution({
        requirementId: input.requirementId,
        planVersion: input.planVersion,
        requestedByUserId: input.requesterUserId
      });

      deps.executionStore.approve({
        requirementId: input.requirementId,
        approvedByUserId: input.requesterUserId
      });

      deps.workflowStore.setStatus({
        requirementId: input.requirementId,
        expected: "plan_reviewing",
        next: "plan_approved"
      });

      return { requirementId: input.requirementId, status: "plan_approved" };
    }
  };
}

export function buildExecutionCancelHandler(deps: RequirementWorkflowHandlerDeps): EffectHandler {
  return {
    pluginId: "requirement-workflow",
    effectType: "execution.cancel",
    execute(effect) {
      const input = effect.input as {
        requirementId: string;
      };

      const current = deps.workflowStore.get(input.requirementId);
      if (!current) {
        throw new Error(`Requirement workflow not found: ${input.requirementId}`);
      }

      deps.workflowStore.setStatus({
        requirementId: input.requirementId,
        expected: current.status,
        next: "cancelled"
      });

      return { requirementId: input.requirementId, status: "cancelled" };
    }
  };
}

export function buildExecutionRunHandler(deps: RequirementWorkflowHandlerDeps): EffectHandler {
  return {
    pluginId: "requirement-workflow",
    effectType: "execution.run",
    async execute(effect) {
      const input = effect.input as {
        requirementId: string;
        requesterUserId: string;
      };

      const plan = deps.planStore.latest(input.requirementId);
      if (!plan) {
        throw new Error(`No plan to execute for requirement: ${input.requirementId}`);
      }

      deps.workflowStore.setStatus({
        requirementId: input.requirementId,
        expected: "plan_approved",
        next: "executing"
      });

      const service = new RequirementExecutionService({
        git: deps.git,
        agent: deps.devAgent,
        executionStore: deps.executionStore,
        workspacePath: deps.workspacePath,
        worktreeRoot: deps.worktreeRoot
      });

      const result = await service.execute({
        requirementId: input.requirementId,
        planMarkdown: plan.markdown,
        approvedByUserId: input.requesterUserId
      });

      deps.workflowStore.setStatus({
        requirementId: input.requirementId,
        expected: "executing",
        next: "implementation_ready"
      });

      return result;
    }
  };
}

export function buildVerificationRunHandler(deps: RequirementWorkflowHandlerDeps): EffectHandler {
  return {
    pluginId: "requirement-workflow",
    effectType: "verification.run",
    async execute(effect) {
      const input = effect.input as {
        requirementId: string;
      };

      deps.workflowStore.setStatus({
        requirementId: input.requirementId,
        expected: "implementation_ready",
        next: "verifying"
      });

      const exec = deps.executionStore.latest(input.requirementId);
      if (!exec?.worktreePath) {
        throw new Error(`No worktree to verify for requirement: ${input.requirementId}`);
      }

      const runner = new VerificationRunner({ runCommand: deps.runCommand });
      const report = await runner.run({
        requirementId: input.requirementId,
        worktreePath: exec.worktreePath,
        checks: [{ id: "test", command: "npm", args: ["test"] }]
      });

      deps.verificationReportStore.save(report);

      deps.workflowStore.setStatus({
        requirementId: input.requirementId,
        expected: "verifying",
        next: report.status === "passed" ? "implementation_ready" : "failed"
      });

      return report;
    }
  };
}

export function buildAcceptanceRunHandler(deps: RequirementWorkflowHandlerDeps): EffectHandler {
  return {
    pluginId: "requirement-workflow",
    effectType: "acceptance.run",
    execute(effect) {
      const input = effect.input as {
        requirementId: string;
      };

      const report = deps.verificationReportStore.latest(input.requirementId);
      if (!report || report.status !== "passed") {
        throw new Error(`REQUIREMENT_NOT_VERIFIED: ${input.requirementId}`);
      }

      deps.workflowStore.setStatus({
        requirementId: input.requirementId,
        expected: "implementation_ready",
        next: "accepted"
      });

      return { requirementId: input.requirementId, status: "accepted" };
    }
  };
}
