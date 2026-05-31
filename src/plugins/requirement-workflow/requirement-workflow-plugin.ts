import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import { RequirementWorkflowStore } from "./requirement-workflow-store.js";
import { requirementWorkflowRuntimeContribution } from "./requirement-workflow-runtime-contribution.js";

export const requirementWorkflowPlugin: FeeglePlugin = {
  id: "requirement-workflow",
  manifest: {
    id: "requirement-workflow",
    version: "1.0.0",
    displayName: "Requirement Workflow",
    description: "Manages the end-to-end lifecycle of a software requirement from intake through implementation acceptance"
  },
  provides: [
    {
      phase: "stores",
      run(ctx) {
        const db = ctx.require("runtimeDb");
        ctx.provide("requirementWorkflowStore", new RequirementWorkflowStore(db));
      }
    }
  ],
  runtimeContributions: [requirementWorkflowRuntimeContribution()]
};
