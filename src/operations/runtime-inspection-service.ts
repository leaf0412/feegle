import type { RuntimeStore } from "../runtime/runtime-store.js";

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

  // RuntimeStore doesn't have a listAllWorkflows method, so this is a placeholder
  // In production, add listWorkflows() to RuntimeStore
  async inspect(workspaceId: string): Promise<RuntimeInspection> {
    return {
      workflows: [],
      totalWorkflows: 0,
      waitingCount: 0,
      failedCount: 0
    };
  }
}
