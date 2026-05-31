import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import { RequirementWorkflowStore } from "./requirement-workflow-store.js";
import { RequirementPlanStore } from "./requirement-plan-store.js";
import { RequirementExecutionStore } from "./requirement-execution-store.js";
import { createRequirementPlanningAgent } from "./requirement-planning-agent.js";
import type { RequirementPlanningAgent } from "./requirement-planning-service.js";
import { requirementWorkflowRuntimeContribution } from "./requirement-workflow-runtime-contribution.js";

// Module-level holders populated during boot phases.
// These are undefined until the corresponding phase provisions run.
let _workflowStore: RequirementWorkflowStore | undefined;
let _planStore: RequirementPlanStore | undefined;
let _executionStore: RequirementExecutionStore | undefined;
let _planningAgent: RequirementPlanningAgent | undefined;

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
        _workflowStore = new RequirementWorkflowStore(db);
        _planStore = new RequirementPlanStore(db);
        _executionStore = new RequirementExecutionStore();
        ctx.provide("requirementWorkflowStore", _workflowStore);
      }
    },
    {
      phase: "providers",
      run(ctx) {
        const agents = ctx.require("agents");
        _planningAgent = createRequirementPlanningAgent(agents);
      }
    }
  ],
  runtimeContributions: [
    requirementWorkflowRuntimeContribution(() => {
      if (!_workflowStore || !_planStore || !_executionStore || !_planningAgent) {
        throw new Error(
          "requirement-workflow deps not initialized at boot: stores and providers phases must run before runtime-contributions"
        );
      }
      return {
        workflowStore: _workflowStore,
        planStore: _planStore,
        executionStore: _executionStore,
        planningAgent: _planningAgent
      };
    })
  ]
};
