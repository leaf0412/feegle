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

type StepCtx = {
  input: unknown;
  executeEffect(e: { pluginId: string; effectType: string; input: unknown }): Promise<unknown>;
};

function readSourcePlugin(input: Record<string, unknown>): string | undefined {
  return typeof input.sourcePlugin === "string" && input.sourcePlugin.length > 0 ? input.sourcePlugin : undefined;
}

// The runtime normalizes effect failures into a {code,message} object (not an
// Error), so String(error) would print "[object Object]" on the failure card.
function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return String(error);
}

// Lock the card a button was clicked on (buttonless, settled state) before the
// next card is sent. Each interactive card is its own message, so locking the
// clicked one + appending a new one keeps every click on a distinct messageId —
// no runtime event-id collisions, and stale cards can't be re-clicked.
async function lockClickedCard(
  stepCtx: StepCtx,
  input: Record<string, unknown>,
  lockedTitle: string,
  lockedNote: string
): Promise<void> {
  const sourcePlugin = readSourcePlugin(input);
  const cardMessageId = typeof input.cardMessageId === "string" && input.cardMessageId.length > 0 ? input.cardMessageId : undefined;
  if (!sourcePlugin || !cardMessageId) {
    return;
  }
  await stepCtx.executeEffect({
    pluginId: sourcePlugin,
    effectType: "requirement.card_locked.render",
    input: { ...input, lockedTitle, lockedNote }
  });
}

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
              const input = stepCtx.input as Record<string, unknown> & { requirementId?: string };
              const reqId = typeof input.requirementId === "string" ? input.requirementId : "";
              await lockClickedCard(stepCtx, input, `✏️ 已提交修改 · ${reqId}`, "正在生成新版本计划，新计划卡见下方。");
              const output = await stepCtx.executeEffect({
                pluginId: "requirement-workflow",
                effectType: "plan.revise",
                input
              });
              // a revision = new plan = new cloud doc, so no docUrl is carried, and
              // the new plan-review card is a fresh message.
              const sourcePlugin = readSourcePlugin(input);
              if (sourcePlugin) {
                await stepCtx.executeEffect({
                  pluginId: sourcePlugin,
                  effectType: "requirement.plan_review.render",
                  input: { ...input, ...(output as Record<string, unknown>), cardMessageId: undefined, docUrl: undefined }
                });
              }
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
              const input = stepCtx.input as Record<string, unknown> & { requirementId: string };
              const sourcePlugin = readSourcePlugin(input);
              const renderDev = (extra: Record<string, unknown>): Promise<unknown> | undefined =>
                sourcePlugin
                  ? stepCtx.executeEffect({
                      pluginId: sourcePlugin,
                      effectType: "requirement.execution_progress.render",
                      // a fresh card for the dev result — never reuse the clicked card's id
                      input: { ...input, cardMessageId: undefined, ...extra }
                    })
                  : undefined;

              // settle the plan-review card the user clicked, then develop
              await lockClickedCard(stepCtx, input, `✅ 已确认计划 · ${input.requirementId}`, "已开始开发，结果见下方卡片。");
              await stepCtx.executeEffect({
                pluginId: "requirement-workflow",
                effectType: "execution.approve",
                input
              });

              let output: unknown;
              try {
                output = await stepCtx.executeEffect({
                  pluginId: "requirement-workflow",
                  effectType: "execution.run",
                  input
                });
              } catch (error) {
                await renderDev({ phase: "failed", error: describeError(error) });
                throw error;
              }

              await renderDev({ phase: "completed", result: output });
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
        async run(stepCtx: StepCtx) {
          const input = stepCtx.input as Record<string, unknown> & { requirementId: string };
          // 取消 is terminal: locking the clicked card IS the result card.
          await lockClickedCard(stepCtx, input, `🚫 已取消 · ${input.requirementId}`, "需求已取消。如需重新开始，请重新发起需求。");
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
        async run(stepCtx: StepCtx) {
          const input = stepCtx.input as Record<string, unknown> & { requirementId: string; docUrl?: string };
          await lockClickedCard(stepCtx, input, `↩︎ 已回退 · ${input.requirementId}`, "已回退到计划，新的计划卡见下方。");
          const reverted = await stepCtx.executeEffect({
            pluginId: "requirement-workflow",
            effectType: "execution.revert_to_plan",
            input
          });
          const sourcePlugin = readSourcePlugin(input);
          if (sourcePlugin) {
            // a fresh plan-review card; docUrl rides the action so the cloud doc
            // is re-linked without creating a new one.
            await stepCtx.executeEffect({
              pluginId: sourcePlugin,
              effectType: "requirement.plan_review.render",
              input: { ...input, ...(reverted as Record<string, unknown>), cardMessageId: undefined, docUrl: input.docUrl }
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
        async run(stepCtx: StepCtx) {
          const input = stepCtx.input as Record<string, unknown> & { requirementId: string };
          await lockClickedCard(stepCtx, input, `✅ 已进入验证 · ${input.requirementId}`, "验证结果见下方卡片。");
          const output = await stepCtx.executeEffect({
            pluginId: "requirement-workflow",
            effectType: "verification.run",
            input
          });
          const sourcePlugin = readSourcePlugin(input);
          if (sourcePlugin) {
            await stepCtx.executeEffect({
              pluginId: sourcePlugin,
              effectType: "requirement.verification_result.render",
              input: { ...input, cardMessageId: undefined, result: output }
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
        async run(stepCtx: StepCtx) {
          const input = stepCtx.input as Record<string, unknown> & { requirementId: string };
          await lockClickedCard(stepCtx, input, `✅ 已提交验收 · ${input.requirementId}`, "验收结果见下方卡片。");
          const output = await stepCtx.executeEffect({
            pluginId: "requirement-workflow",
            effectType: "acceptance.run",
            input
          });
          const sourcePlugin = readSourcePlugin(input);
          if (sourcePlugin) {
            await stepCtx.executeEffect({
              pluginId: sourcePlugin,
              effectType: "requirement.acceptance_result.render",
              input: { ...input, cardMessageId: undefined, result: output }
            });
          }
          return { kind: "complete" as const, output };
        }
      }
    ]
  };
}
