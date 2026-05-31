import type { RuntimeStore } from "../runtime/runtime-store.js";

export interface StuckRun {
  attemptId: string;
  workflowInstanceId: string;
  status: string;
}

export class StuckRunDetector {
  constructor(
    private readonly store: RuntimeStore,
    private readonly maxRunningMs: number = 30 * 60 * 1000 // 30 minutes
  ) {}

  detect(nowIso: string): StuckRun[] {
    return this.store.listRunningAttemptsOlderThan(nowIso, this.maxRunningMs).map((row) => ({
      attemptId: row.id,
      workflowInstanceId: row.workflowInstanceId,
      status: row.status
    }));
  }
}
