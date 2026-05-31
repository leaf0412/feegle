import type { RuntimeStore } from "../core/runtime/runtime-store.js";

export interface WorkflowSummary {
  id: string;
  status: string;
  currentStepId: string | null;
  definitionId: string | null;
}

export interface RuntimeInspection {
  workflows: WorkflowSummary[];
  totalWorkflows: number;
  waitingCount: number;
  failedCount: number;
}

export class RuntimeInspectionService {
  constructor(private readonly store: RuntimeStore) {}

  async inspect(workspaceId: string): Promise<RuntimeInspection> {
    const workflows = this.store.listWorkflowSummaries(workspaceId);
    return {
      workflows,
      totalWorkflows: workflows.length,
      waitingCount: workflows.filter((w) => w.status === "waiting").length,
      failedCount: workflows.filter((w) => w.status === "failed").length
    };
  }
}
