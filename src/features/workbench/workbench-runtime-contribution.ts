import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";

export function workbenchRuntimeContribution(): RuntimeContributionModule {
  return {
    id: "workbench-runtime",
    register: (ctx) => {
      // ---- Workflow selectors for workbench operations ----

      ctx.workflowSelector.register({
        id: "workbench-plan-approve",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_approve",
        definitionId: "workbench.plan.approve"
      });

      ctx.workflowSelector.register({
        id: "workbench-plan-reject",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_reject",
        definitionId: "workbench.plan.reject"
      });

      ctx.workflowSelector.register({
        id: "workbench-plan-cancel",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_cancel",
        definitionId: "workbench.plan.cancel"
      });

      ctx.workflowSelector.register({
        id: "workbench-plan-push",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_push",
        definitionId: "workbench.plan.push"
      });

      ctx.workflowSelector.register({
        id: "workbench-plan-cleanup",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_cleanup",
        definitionId: "workbench.plan.cleanup"
      });

      ctx.workflowSelector.register({
        id: "workbench-plan-revise-execution",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_revise_execution",
        definitionId: "workbench.plan.revise_execution"
      });

      ctx.workflowSelector.register({
        id: "workbench-plan-base-branch-submit",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_base_branch_submit",
        definitionId: "workbench.plan.base_branch_submit"
      });

      ctx.workflowSelector.register({
        id: "workbench-plan-revision-submit",
        matches: (intent) =>
          intent.kind === "workflow_signal" &&
          typeof intent.payload === "object" &&
          intent.payload !== null &&
          (intent.payload as Record<string, unknown>).actionType === "workbench_plan_revision_submit",
        definitionId: "workbench.plan.revision_submit"
      });

      // ---- Workflow definitions ----

      // Plan approval workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.approve",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "validate_and_request_base",
            async run(stepCtx) {
              const payload = stepCtx.input as {
                actionType?: string;
                planId?: string;
                chatId?: string;
                messageId?: string;
              };
              // Execute validation effect
              const result = await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.validate_approve",
                input: { planId: payload.planId }
              });
              const needsBaseBranch = (result as Record<string, unknown>)?.needsBaseBranch === true;
              if (needsBaseBranch) {
                // Wait for base branch submission via control action
                return {
                  kind: "wait" as const,
                  reason: "needs base branch",
                  waitFor: { kind: "control_action" as const, action: "base_branch_submit" },
                  output: { planId: payload.planId }
                };
              }
              return { kind: "continue" as const, output: { approved: true } };
            }
          },
          {
            stepId: "execute_or_complete",
            async run(stepCtx) {
              const input = stepCtx.input as { previousOutput?: { planId?: string }; signal?: Record<string, unknown> };
              const planId = input.previousOutput?.planId ?? (input.signal?._planId as string | undefined);
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "card.update",
                input: { planId, status: "executing" }
              });
              return { kind: "complete" as const, output: { approved: true } };
            }
          }
        ]
      });

      // Plan rejection workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.reject",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "process_rejection",
            async run(stepCtx) {
              const payload = stepCtx.input as {
                actionType?: string;
                planId?: string;
                chatId?: string;
                messageId?: string;
              };
              // Execute plan reject effect (records a rejected control action)
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.reject",
                input: { planId: payload.planId }
              });
              // Update the card to show rejected status
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "card.update",
                input: { planId: payload.planId, status: "rejected" }
              });
              return { kind: "complete" as const, output: { rejected: true } };
            }
          }
        ]
      });

      // Plan cancel workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.cancel",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "process_cancel",
            async run(stepCtx) {
              const payload = stepCtx.input as { planId?: string };
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.cancel",
                input: { planId: payload.planId }
              });
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "card.update",
                input: { planId: payload.planId, status: "cancelled" }
              });
              return { kind: "complete" as const, output: { cancelled: true } };
            }
          }
        ]
      });

      // Plan push workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.push",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "process_push",
            async run(stepCtx) {
              const payload = stepCtx.input as { planId?: string };
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.push",
                input: { planId: payload.planId }
              });
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "card.update",
                input: { planId: payload.planId, status: "pushed" }
              });
              return { kind: "complete" as const, output: { pushed: true } };
            }
          }
        ]
      });

      // Plan cleanup workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.cleanup",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "process_cleanup",
            async run(stepCtx) {
              const payload = stepCtx.input as { planId?: string };
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.cleanup",
                input: { planId: payload.planId }
              });
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "card.update",
                input: { planId: payload.planId, status: "cleaned" }
              });
              return { kind: "complete" as const, output: { cleaned: true } };
            }
          }
        ]
      });

      // Plan revise execution workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.revise_execution",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "process_revise_execution",
            async run(stepCtx) {
              const payload = stepCtx.input as { planId?: string; version?: number };
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.revise_execution",
                input: { planId: payload.planId }
              });
              return { kind: "complete" as const, output: { revised: true } };
            }
          }
        ]
      });

      // Plan base branch submit workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.base_branch_submit",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "process_base_branch",
            async run(stepCtx) {
              const payload = stepCtx.input as {
                planId?: string;
                baseBranch?: string;
                headBranch?: string;
              };
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.base_branch_submit",
                input: { planId: payload.planId, baseBranch: payload.baseBranch, headBranch: payload.headBranch }
              });
              return { kind: "complete" as const, output: { submitted: true } };
            }
          }
        ]
      });

      // Plan revision submit workflow
      ctx.workflows.register({
        definitionId: "workbench.plan.revision_submit",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "process_revision_submit",
            async run(stepCtx) {
              const payload = stepCtx.input as { planId?: string; revisionNote?: string };
              await stepCtx.executeEffect({
                pluginId: "workbench",
                effectType: "plan.revision_submit",
                input: { planId: payload.planId, revisionNote: payload.revisionNote }
              });
              return { kind: "complete" as const, output: { submitted: true } };
            }
          }
        ]
      });

      // ---- Effect handlers for workbench operations ----
      // These are stub handlers that will be wired to PlanExecutionService
      // when the runtime effect executor is connected to real service instances.

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.validate_approve",
        execute: async (_effect) => {
          // Stub: returns needsBaseBranch=true to trigger wait
          // TODO: Wire to PlanExecutionService.approve() in phase 2
          return { valid: true, needsBaseBranch: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.reject",
        execute: async (_effect) => {
          // Stub: would record a rejected control action in production
          // TODO: Wire to PlanExecutionService.cancel() in phase 2
          return { rejected: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.cancel",
        execute: async (_effect) => {
          // TODO: Wire to PlanExecutionService.cancel() in phase 2
          return { cancelled: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.push",
        execute: async (_effect) => {
          // TODO: Wire to PlanExecutionService.push() in phase 2
          return { pushed: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.cleanup",
        execute: async (_effect) => {
          // TODO: Wire to PlanExecutionService.cleanup() in phase 2
          return { cleaned: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.revise_execution",
        execute: async (_effect) => {
          // TODO: Wire to PlanExecutionService.reviseExecution() in phase 2
          return { revised: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.base_branch_submit",
        execute: async (_effect) => {
          // TODO: Wire to PlanExecutionService.submitBaseBranch() in phase 2
          return { submitted: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "plan.revision_submit",
        execute: async (_effect) => {
          // TODO: Wire to PlanArtifactService.revisePlan() in phase 2
          return { submitted: true, planId: (_effect.input as Record<string, unknown>).planId };
        }
      });

      ctx.effectHandlers.register({
        pluginId: "workbench",
        effectType: "card.update",
        execute: async (_effect) => {
          // Stub: card update effect handler
          // TODO: Wire to actual card update service in phase 2
          return { updated: true, cardId: (_effect.input as Record<string, unknown>).planId };
        }
      });
    }
  };
}
