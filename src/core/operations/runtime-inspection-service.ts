import type { RuntimeStore, ControlActionRow, EffectSummaryRow } from "@core/runtime/runtime-store.js";

export interface WorkflowSummary {
  id: string;
  status: string;
  currentStepId: string | null;
  definitionId: string | null;
}

export interface RunAttemptProjection {
  id: string;
  status: string;
  triggerEventId: string | null;
  createdAt: string;
  finishedAt: string | null;
  workflowInstanceId: string;
}

export interface RunDetail {
  runAttempt: RunAttemptProjection;
  workflow: {
    id: string;
    status: string;
    definitionId: string | null;
    workspaceId: string | null;
  } | null;
  effects: EffectSummaryRow[];
  controlActions: ControlActionRow[];
}

export interface RuntimeInspection {
  workflows: WorkflowSummary[];
  totalWorkflows: number;
  waitingCount: number;
  failedCount: number;
  latestControlActions: ControlActionRow[];
}

export class RuntimeInspectionService {
  constructor(private readonly store: RuntimeStore) {}

  async inspect(workspaceId: string): Promise<RuntimeInspection> {
    const workflows = this.store.listWorkflowSummaries(workspaceId);
    const latestControlActions = this.store.listLatestControlActions(workspaceId, 10);
    return {
      workflows,
      totalWorkflows: workflows.length,
      waitingCount: workflows.filter((w) => w.status === "waiting").length,
      failedCount: workflows.filter((w) => w.status === "failed").length,
      latestControlActions
    };
  }

  async getRunDetail(runAttemptId: string, workspaceId?: string): Promise<RunDetail | null> {
    // Use a raw query to get the full run attempt info
    const runAttempt = this.store.getRunAttemptDetail(runAttemptId);
    if (!runAttempt) return null;

    const workflow = runAttempt.workflowInstanceId
      ? this.store.getWorkflowInstance(runAttempt.workflowInstanceId) ?? null
      : null;

    const effects = this.store.listEffectSummaries(runAttemptId);

    // Use provided workspaceId or resolve from workflow instance
    const resolvedWorkspaceId = workspaceId ?? (workflow?.id ? this.store.getWorkflowWorkspaceId(workflow.id) : null);
    const controlActions = resolvedWorkspaceId
      ? this.store.listLatestControlActions(resolvedWorkspaceId, 10)
      : [];

    return {
      runAttempt: {
        id: runAttempt.id,
        status: runAttempt.status,
        triggerEventId: runAttempt.triggerEventId,
        createdAt: runAttempt.createdAt,
        finishedAt: runAttempt.finishedAt,
        workflowInstanceId: runAttempt.workflowInstanceId
      },
      workflow: workflow
        ? {
            id: workflow.id,
            status: workflow.status,
            definitionId: workflow.definitionId,
            workspaceId: resolvedWorkspaceId
          }
        : null,
      effects,
      controlActions
    };
  }
}
