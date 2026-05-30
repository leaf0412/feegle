import type { RuntimeError } from "../runtime/runtime-models.js";

export interface DiagnosticBundle {
  target: {
    workflowInstanceId?: string;
    runAttemptId?: string;
    stepStateId?: string;
    effectExecutionId?: string;
  };
  statusSnapshot: Record<string, unknown>;
  error: RuntimeError;
  timeline: Array<{ at: string; type: string; summary: string }>;
  failedEffects: Array<{ effectExecutionId: string; pluginId: string; effectType: string }>;
  relatedArtifacts: string[];
  relatedMemory: string[];
  environmentSummary: Record<string, unknown>;
}
