import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";
import type { RequirementWorkflowHandlerDeps } from "./requirement-workflow-effect-handlers.js";
import {
  buildPlanGenerateHandler,
  buildPlanReviseHandler,
  buildExecutionApproveHandler,
  buildExecutionCancelHandler,
  buildRevertToPlanHandler,
  buildExecutionRunHandler,
  buildVerificationRunHandler,
  buildAcceptanceRunHandler
} from "./requirement-workflow-effect-handlers.js";

export type { RequirementWorkflowHandlerDeps };

export function requirementWorkflowRuntimeContribution(
  getDeps?: () => RequirementWorkflowHandlerDeps
): RuntimeContributionModule {
  return {
    id: "requirement-workflow-runtime",
    register(ctx) {
      ctx.workflowSelector.register({
        id: "requirement-intake",
        matches: (intent) => intent.kind === "requirement_intake",
        definitionId: "requirement.intake.workflow"
      });

      ctx.workflows.register({
        definitionId: "requirement.intake.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "run_intake",
            async run(stepCtx) {
              const input = stepCtx.input as { requirementId?: string; sourcePlugin?: string; [k: string]: unknown };
              const output = await stepCtx.executeEffect({
                pluginId: "requirement-workflow",
                effectType: "plan.generate",
                input
              });
              if (typeof input.sourcePlugin === "string" && input.sourcePlugin.length > 0) {
                await stepCtx.executeEffect({
                  pluginId: input.sourcePlugin,
                  effectType: "requirement.plan_review.render",
                  input: { ...input, ...(output as Record<string, unknown>) }
                });
              }
              return { kind: "complete", output };
            }
          }
        ]
      });

      ctx.workflowSelector.register({
        id: "requirement-plan-generate",
        matches: (intent) => intent.kind === "requirement_plan_generate",
        definitionId: "requirement.plan.generate.workflow"
      });

      ctx.workflowSelector.register({
        id: "requirement-plan-revise",
        matches: (intent) => intent.kind === "requirement_plan_revise",
        definitionId: "requirement.plan.revise.workflow"
      });

      ctx.workflows.register({
        definitionId: "requirement.plan.generate.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "generate_plan",
            async run(stepCtx) {
              const output = await stepCtx.executeEffect({
                pluginId: "requirement-workflow",
                effectType: "plan.generate",
                input: stepCtx.input
              });
              return { kind: "complete", output };
            }
          }
        ]
      });

      ctx.workflows.register({
        definitionId: "requirement.plan.revise.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "revise_plan",
            async run(stepCtx) {
              const output = await stepCtx.executeEffect({
                pluginId: "requirement-workflow",
                effectType: "plan.revise",
                input: stepCtx.input
              });
              return { kind: "complete", output };
            }
          }
        ]
      });

      ctx.workflowSelector.register({
        id: "requirement-plan-approve",
        matches: (intent) => intent.kind === "requirement_plan_approve",
        definitionId: "requirement.plan.approve.workflow"
      });

      // Approving the plan starts development on the same card: no separate
      // "执行开发" button. The card flips to 开发中 (locked), then to the dev
      // result (结束/取消) or, if the run throws, to 开发失败 (取消) before the
      // failure surfaces — the card never stays stuck on 开发中.
      ctx.workflows.register({
        definitionId: "requirement.plan.approve.workflow",
        version: 1,
        concurrencyPolicy: "reject_if_running",
        steps: [
          {
            stepId: "approve_and_develop",
            async run(stepCtx) {
              const input = stepCtx.input as { requirementId: string; sourcePlugin?: string; [k: string]: unknown };
              const sourcePlugin = typeof input.sourcePlugin === "string" && input.sourcePlugin.length > 0
                ? input.sourcePlugin
                : undefined;
              const render = (extra: Record<string, unknown>): Promise<unknown> | undefined =>
                sourcePlugin
                  ? stepCtx.executeEffect({
                      pluginId: sourcePlugin,
                      effectType: "requirement.execution_progress.render",
                      input: { ...input, ...extra }
                    })
                  : undefined;

              await stepCtx.executeEffect({
                pluginId: "requirement-workflow",
                effectType: "execution.approve",
                input
              });
              await render({ phase: "developing" });

              let output: unknown;
              try {
                output = await stepCtx.executeEffect({
                  pluginId: "requirement-workflow",
                  effectType: "execution.run",
                  input
                });
              } catch (error) {
                await render({ phase: "failed", error: error instanceof Error ? error.message : String(error) });
                throw error;
              }

              await render({ phase: "completed", result: output });
              return { kind: "complete", output };
            }
          }
        ]
      });

      ctx.workflowSelector.register({
        id: "requirement-verify",
        matches: (intent) => intent.kind === "requirement_verify",
        definitionId: "requirement.verify.workflow"
      });

      ctx.workflowSelector.register({
        id: "requirement-accept",
        matches: (intent) => intent.kind === "requirement_accept",
        definitionId: "requirement.accept.workflow"
      });

      ctx.workflowSelector.register({
        id: "requirement-cancel",
        matches: (intent) => intent.kind === "requirement_cancel",
        definitionId: "requirement.cancel.workflow"
      });

      ctx.workflowSelector.register({
        id: "requirement-plan-back",
        matches: (intent) => intent.kind === "requirement_plan_back",
        definitionId: "requirement.plan.back.workflow"
      });

      ctx.workflows.register(buildVerifyWorkflow());
      ctx.workflows.register(buildAcceptWorkflow());
      ctx.workflows.register(buildCancelWorkflow());
      ctx.workflows.register(buildBackWorkflow());

      if (getDeps) {
        const deps = getDeps();
        ctx.effectHandlers.register(buildPlanGenerateHandler(deps));
        ctx.effectHandlers.register(buildPlanReviseHandler(deps));
        ctx.effectHandlers.register(buildExecutionApproveHandler(deps));
        ctx.effectHandlers.register(buildExecutionCancelHandler(deps));
        ctx.effectHandlers.register(buildRevertToPlanHandler(deps));
        ctx.effectHandlers.register(buildExecutionRunHandler(deps));
        ctx.effectHandlers.register(buildVerificationRunHandler(deps));
        ctx.effectHandlers.register(buildAcceptanceRunHandler(deps));
      }
    }
  };
}

function buildCancelWorkflow() {
  return {
    definitionId: "requirement.cancel.workflow",
    version: 1,
    concurrencyPolicy: "reject_if_running" as const,
    steps: [
      {
        stepId: "cancel",
        async run(stepCtx: { input: unknown; executeEffect(e: { pluginId: string; effectType: string; input: unknown }): Promise<unknown> }) {
          const input = stepCtx.input as { requirementId: string; sourcePlugin?: string; [key: string]: unknown };
          const output = await stepCtx.executeEffect({
            pluginId: "requirement-workflow",
            effectType: "execution.cancel",
            input
          });
          return { kind: "complete" as const, output };
        }
      }
    ]
  };
}

function buildBackWorkflow() {
  return {
    definitionId: "requirement.plan.back.workflow",
    version: 1,
    concurrencyPolicy: "reject_if_running" as const,
    steps: [
      {
        stepId: "revert_to_plan",
        async run(stepCtx: { input: unknown; executeEffect(e: { pluginId: string; effectType: string; input: unknown }): Promise<unknown> }) {
          const input = stepCtx.input as { requirementId: string; sourcePlugin?: string; docUrl?: string; [key: string]: unknown };
          const reverted = await stepCtx.executeEffect({
            pluginId: "requirement-workflow",
            effectType: "execution.revert_to_plan",
            input
          });
          if (typeof input.sourcePlugin === "string" && input.sourcePlugin.length > 0) {
            // re-render the plan-review card in place; docUrl rides the action so
            // the cloud doc is re-linked without creating a new one.
            await stepCtx.executeEffect({
              pluginId: input.sourcePlugin,
              effectType: "requirement.plan_review.render",
              input: { ...input, ...(reverted as Record<string, unknown>), docUrl: input.docUrl }
            });
          }
          return { kind: "complete" as const, output: reverted };
        }
      }
    ]
  };
}

function buildVerifyWorkflow() {
  return {
    definitionId: "requirement.verify.workflow",
    version: 1,
    concurrencyPolicy: "reject_if_running" as const,
    steps: [
      {
        stepId: "run_verification",
        async run(stepCtx: { input: unknown; executeEffect(e: { pluginId: string; effectType: string; input: unknown }): Promise<unknown> }) {
          const input = stepCtx.input as { requirementId: string; sourcePlugin?: string; [key: string]: unknown };
          const output = await stepCtx.executeEffect({
            pluginId: "requirement-workflow",
            effectType: "verification.run",
            input
          });
          if (typeof input.sourcePlugin === "string" && input.sourcePlugin.length > 0) {
            await stepCtx.executeEffect({
              pluginId: input.sourcePlugin,
              effectType: "requirement.verification_result.render",
              input: { ...input, result: output }
            });
          }
          return { kind: "complete" as const, output };
        }
      }
    ]
  };
}

function buildAcceptWorkflow() {
  return {
    definitionId: "requirement.accept.workflow",
    version: 1,
    concurrencyPolicy: "reject_if_running" as const,
    steps: [
      {
        stepId: "accept",
        async run(stepCtx: { input: unknown; executeEffect(e: { pluginId: string; effectType: string; input: unknown }): Promise<unknown> }) {
          const input = stepCtx.input as { requirementId: string; sourcePlugin?: string; [key: string]: unknown };
          const output = await stepCtx.executeEffect({
            pluginId: "requirement-workflow",
            effectType: "acceptance.run",
            input
          });
          if (typeof input.sourcePlugin === "string" && input.sourcePlugin.length > 0) {
            await stepCtx.executeEffect({
              pluginId: input.sourcePlugin,
              effectType: "requirement.acceptance_result.render",
              input: { ...input, result: output }
            });
          }
          return { kind: "complete" as const, output };
        }
      }
    ]
  };
}
