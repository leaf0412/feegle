import { join } from "node:path";
import type { FeeglePlugin } from "@infra/boot/feegle-plugin.js";
import { RequirementWorkflowStore } from "./requirement-workflow-store.js";
import { RequirementPlanStore } from "./requirement-plan-store.js";
import { RequirementExecutionStore } from "./requirement-execution-store.js";
import { VerificationReportStore } from "./verification/verification-report-store.js";
import { createRequirementPlanningAgent } from "./requirement-planning-agent.js";
import { createRequirementExecutionGit } from "./requirement-execution-git.js";
import { createRequirementDevelopmentAgent } from "./requirement-development-agent.js";
import { createVerificationCommandRunner } from "./verification/command-runner.js";
import type { RequirementPlanningAgent } from "./requirement-planning-service.js";
import type { RequirementExecutionGit } from "./requirement-execution-service.js";
import type { RequirementDevelopmentAgent } from "./requirement-execution-service.js";
import type { VerificationCommandRunner } from "./verification/verification-models.js";
import { requirementWorkflowRuntimeContribution } from "./requirement-workflow-runtime-contribution.js";

export interface RequirementWorkflowPluginDeps {
  feegleHome: string;
}

export function createRequirementWorkflowPlugin(deps: RequirementWorkflowPluginDeps): FeeglePlugin {
  // Module-level holders populated during boot phases.
  // These are undefined until the corresponding phase provisions run.
  let _workflowStore: RequirementWorkflowStore | undefined;
  let _planStore: RequirementPlanStore | undefined;
  let _executionStore: RequirementExecutionStore | undefined;
  let _verificationReportStore: VerificationReportStore | undefined;
  let _runCommand: VerificationCommandRunner | undefined;
  let _planningAgent: RequirementPlanningAgent | undefined;
  let _git: RequirementExecutionGit | undefined;
  let _devAgent: RequirementDevelopmentAgent | undefined;
  let _workspacePath: string | undefined;
  let _worktreeRoot: string | undefined;

  return {
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
          _verificationReportStore = new VerificationReportStore();
          _runCommand = createVerificationCommandRunner();
          ctx.provide("requirementWorkflowStore", _workflowStore);
        }
      },
      {
        phase: "providers",
        run(ctx) {
          const agents = ctx.require("agents");
          _planningAgent = createRequirementPlanningAgent(agents);
          _git = createRequirementExecutionGit(ctx.require("gitService"));
          _devAgent = createRequirementDevelopmentAgent(agents);

          const cfg = ctx.require("configStore").get();
          const workspacePath = cfg.gitlab?.workspace;
          if (!workspacePath) {
            throw new Error(
              "config.gitlab.workspace is required for requirement execution"
            );
          }
          _workspacePath = workspacePath;
          _worktreeRoot = join(deps.feegleHome, "worktrees");
        }
      }
    ],
    runtimeContributions: [
      requirementWorkflowRuntimeContribution(() => {
        if (
          !_workflowStore ||
          !_planStore ||
          !_executionStore ||
          !_verificationReportStore ||
          !_runCommand ||
          !_planningAgent ||
          !_git ||
          !_devAgent ||
          !_workspacePath ||
          !_worktreeRoot
        ) {
          throw new Error(
            "requirement-workflow deps not initialized at boot: stores and providers phases must run before runtime-contributions"
          );
        }
        return {
          workflowStore: _workflowStore,
          planStore: _planStore,
          executionStore: _executionStore,
          planningAgent: _planningAgent,
          git: _git,
          devAgent: _devAgent,
          verificationReportStore: _verificationReportStore,
          runCommand: _runCommand,
          workspacePath: _workspacePath,
          worktreeRoot: _worktreeRoot
        };
      })
    ]
  };
}
