import type { ControlActionStore } from "../control/control-action-store.js";
import type { MemoryStore } from "../memory/memory-store.js";
import type { RuntimeError } from "../runtime/runtime-models.js";
import type { WorkflowDefinition } from "../runtime/runtime-models.js";
import type { RecoveryService } from "./recovery-service.js";

export type FailureClass =
  | { kind: "recoverable"; category: string; suggestion: string }
  | { kind: "non_recoverable"; reason: string }
  | { kind: "unknown"; reason: string };

/**
 * Classify a RuntimeError into deterministic categories.
 */
export function classifyFailure(error: RuntimeError): FailureClass {
  if (error.category === "validation" || error.category === "permission") {
    return { kind: "non_recoverable", reason: `${error.category}: ${error.message}` };
  }
  if (error.category === "agent_process") {
    return { kind: "recoverable", category: "agent_process", suggestion: "restart agent or retry" };
  }
  if (error.category === "capability" && error.recoverable) {
    return { kind: "recoverable", category: "capability", suggestion: "retry with backoff or alternative handler" };
  }
  if (error.recoverable) {
    return { kind: "recoverable", category: error.category, suggestion: "retry" };
  }
  return { kind: "unknown", reason: error.message };
}

export interface RecoveryWorkflowDeps {
  recoveryService: RecoveryService;
  memoryStore: MemoryStore;
  controlActionStore: ControlActionStore;
}

export function createRecoveryWorkflow(
  deps: RecoveryWorkflowDeps
): WorkflowDefinition {
  return {
    definitionId: "core.recovery.workflow",
    version: 1,
    concurrencyPolicy: "skip_if_running",
    steps: [
      {
        stepId: "collect_diagnostics",
        run: async (ctx) => {
          const input = ctx.input as {
            workflowInstanceId?: string;
            runAttemptId?: string;
            workspaceId: string;
            error: RuntimeError;
            now: string;
          };

          const artifactId = `diag_${input.runAttemptId ?? input.workflowInstanceId ?? "unknown"}`;
          const artifact = await deps.recoveryService.createDiagnosticBundle({
            artifactId,
            workspaceId: input.workspaceId,
            workflowInstanceId: input.workflowInstanceId,
            runAttemptId: input.runAttemptId,
            error: input.error,
            now: input.now
          });

          return {
            kind: "continue" as const,
            output: { artifactId: artifact.id, error: input.error },
            next: "classify_failure"
          };
        }
      },
      {
        stepId: "classify_failure",
        run: (ctx) => {
          const input = ctx.input as {
            artifactId: string;
            error: RuntimeError;
            workspaceId: string;
          };

          const classification = classifyFailure(input.error);

          return {
            kind: "continue" as const,
            output: {
              artifactId: input.artifactId,
              error: input.error,
              classification
            },
            next: "search_memory"
          };
        }
      },
      {
        stepId: "search_memory",
        run: (ctx) => {
          const input = ctx.input as {
            workspaceId: string;
            artifactId: string;
            error: RuntimeError;
            classification: FailureClass;
          };

          const relevant = deps.memoryStore.listActive(input.workspaceId);
          const errorHint = relevant.filter(
            (m) => m.content.includes(input.error.code) || m.content.includes(input.error.message)
          );

          return {
            kind: "continue" as const,
            output: {
              artifactId: input.artifactId,
              error: input.error,
              classification: input.classification,
              relatedMemoryIds: errorHint.map((m) => m.id)
            },
            next: "propose_recovery"
          };
        }
      },
      {
        stepId: "propose_recovery",
        run: (ctx) => {
          const input = ctx.input as {
            artifactId: string;
            error: RuntimeError;
            classification: FailureClass;
            relatedMemoryIds: string[];
          };

          if (input.classification.kind === "non_recoverable") {
            return {
              kind: "continue" as const,
              output: {
                artifactId: input.artifactId,
                action: "none" as const,
                reason: input.classification.reason
              }
            };
          }

          if (input.classification.kind === "recoverable") {
            return {
              kind: "continue" as const,
              output: {
                artifactId: input.artifactId,
                action: "retry" as const,
                suggestion: input.classification.suggestion
              }
            };
          }

          return {
            kind: "continue" as const,
            output: {
              artifactId: input.artifactId,
              action: "request_approval" as const,
              reason: input.classification.reason
            }
          };
        }
      },
      {
        stepId: "request_approval",
        run: (ctx) => {
          const input = ctx.input as {
            artifactId: string;
            action: string;
            suggestion?: string;
            reason?: string;
            workspaceId: string;
            runAttemptId?: string;
          };

          if (input.action === "request_approval") {
            const now = new Date().toISOString();
            deps.controlActionStore.create({
              id: `ctrl_recovery_${input.artifactId}`,
              workspaceId: input.workspaceId,
              actorUserId: null,
              actionType: "trigger_recovery",
              payload: {
                artifactId: input.artifactId,
                reason: input.reason ?? "unknown failure"
              },
              now
            });

            return {
              kind: "wait",
              reason: "recovery requires human approval",
              waitFor: { kind: "control_action", action: "trigger_recovery" },
              output: input
            };
          }

          return { kind: "complete", output: input };
        }
      }
    ]
  };
}
