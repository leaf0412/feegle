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
    const interrupted = this.store.markRunningAttemptsInterrupted(nowIso);
    // Returns count of interrupted attempts; actual attempt IDs aren't returned
    // In production, extend RuntimeStore to return more detail
    if (interrupted > 0) {
      return [{ attemptId: "multiple", workflowInstanceId: "multiple", status: "interrupted" }];
    }
    return [];
  }
}
