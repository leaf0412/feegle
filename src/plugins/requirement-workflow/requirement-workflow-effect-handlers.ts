import type { EffectHandler } from "@core/runtime/effect-handler-registry.js";
import type { RequirementWorkflowStore } from "./requirement-workflow-store.js";
import type { RequirementPlanStore } from "./requirement-plan-store.js";
import type { RequirementExecutionStore } from "./requirement-execution-store.js";
import type { RequirementPlanningAgent } from "./requirement-planning-service.js";
import { RequirementPlanningService } from "./requirement-planning-service.js";

export interface RequirementWorkflowHandlerDeps {
  workflowStore: RequirementWorkflowStore;
  planStore: RequirementPlanStore;
  executionStore: RequirementExecutionStore;
  planningAgent: RequirementPlanningAgent;
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
