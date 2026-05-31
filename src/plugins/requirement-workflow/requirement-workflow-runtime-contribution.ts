import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";

export function requirementWorkflowRuntimeContribution(): RuntimeContributionModule {
  return {
    id: "requirement-workflow-runtime",
    register(ctx) {
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
    }
  };
}
