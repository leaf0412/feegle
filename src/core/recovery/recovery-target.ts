import type { RuntimeError } from "../runtime/runtime-models.js";

/**
 * Recovery targets represent the specific failure that triggered recovery.
 * Each target carries enough context for the recovery workflow to diagnose,
 * propose, and execute a recovery action.
 */
export type RecoveryTarget =
  | {
      kind: "failed_attempt";
      workflowInstanceId: string;
      runAttemptId: string;
      error: RuntimeError;
    }
  | {
      kind: "failed_step";
      workflowInstanceId: string;
      runAttemptId: string;
      stepStateId: string;
      error: RuntimeError;
    }
  | {
      kind: "failed_effect";
      workflowInstanceId: string;
      runAttemptId: string;
      effectExecutionId: string;
      error: RuntimeError;
    }
  | {
      kind: "stuck_workflow";
      workflowInstanceId: string;
      runAttemptId: string;
      stuckSince: string;
    };

/**
 * Normalize recovery target resource identifiers into a common shape
 * for use across recovery steps.
 */
export function normalizeTarget(target: RecoveryTarget): {
  workflowInstanceId: string;
  runAttemptId: string;
  error?: RuntimeError;
  stuckSince?: string;
} {
  return {
    workflowInstanceId: target.workflowInstanceId,
    runAttemptId: target.runAttemptId,
    error: target.kind !== "stuck_workflow" ? target.error : undefined,
    stuckSince: target.kind === "stuck_workflow" ? target.stuckSince : undefined
  };
}
