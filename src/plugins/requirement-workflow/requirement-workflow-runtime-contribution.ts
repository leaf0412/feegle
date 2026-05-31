import type { RuntimeContributionModule } from "@infra/boot/feegle-plugin.js";

export function requirementWorkflowRuntimeContribution(): RuntimeContributionModule {
  return {
    id: "requirement-workflow-runtime",
    register(_ctx) {
      // Selectors, intent resolvers, and workflow definitions are added in Plans 70-72.
    }
  };
}
