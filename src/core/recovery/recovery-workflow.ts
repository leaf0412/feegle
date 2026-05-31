import type { ControlActionStore } from "../control/control-action-store.js";
import type { MemoryStore } from "../memory/memory-store.js";
import type { RuntimeError } from "../runtime/runtime-models.js";
import type { WorkflowDefinition } from "../runtime/runtime-models.js";
import type { RecoveryService } from "./recovery-service.js";
import type { RecoveryTarget } from "./recovery-target.js";

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
      // Step 1: Collect diagnostics — create a diagnostic bundle artifact
      {
        stepId: "collect_diagnostics",
        run: async (ctx) => {
          const input = ctx.input as {
            target?: RecoveryTarget;
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
            output: { artifactId: artifact.id, error: input.error, target: input.target },
            next: "classify_failure"
          };
        }
      },

      // Step 2: Classify the failure — determine failure class
      {
        stepId: "classify_failure",
        run: (ctx) => {
          const input = ctx.input as {
            artifactId: string;
            error: RuntimeError;
            workspaceId: string;
            target?: RecoveryTarget;
          };

          const classification = classifyFailure(input.error);

          return {
            kind: "continue" as const,
            output: {
              artifactId: input.artifactId,
              error: input.error,
              classification,
              target: input.target
            },
            next: "search_memory"
          };
        }
      },

      // Step 3: Search memory for related failure patterns
      {
        stepId: "search_memory",
        run: (ctx) => {
          const input = ctx.input as {
            workspaceId: string;
            artifactId: string;
            error: RuntimeError;
            classification: FailureClass;
            target?: RecoveryTarget;
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
              relatedMemoryIds: errorHint.map((m) => m.id),
              target: input.target
            },
            next: "propose_recovery"
          };
        }
      },

      // Step 4: Propose a recovery action based on classification
      {
        stepId: "propose_recovery",
        run: (ctx) => {
          const input = ctx.input as {
            artifactId: string;
            error: RuntimeError;
            classification: FailureClass;
            relatedMemoryIds: string[];
            target?: RecoveryTarget;
          };

          if (input.classification.kind === "non_recoverable") {
            return {
              kind: "continue" as const,
              output: {
                artifactId: input.artifactId,
                action: "none" as const,
                reason: input.classification.reason,
                target: input.target
              }
            };
          }

          if (input.classification.kind === "recoverable") {
            return {
              kind: "continue" as const,
              output: {
                artifactId: input.artifactId,
                action: "retry" as const,
                suggestion: input.classification.suggestion,
                target: input.target
              }
            };
          }

          return {
            kind: "continue" as const,
            output: {
              artifactId: input.artifactId,
              action: "request_approval" as const,
              reason: input.classification.reason,
              target: input.target
            }
          };
        }
      },

      // Step 5: Request human approval if needed, otherwise pass through
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
            target?: RecoveryTarget;
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

          // Pass through — no approval needed
          return { kind: "continue", output: input, next: "execute_recovery" };
        }
      },

      // Step 6: Execute the chosen recovery action
      {
        stepId: "execute_recovery",
        run: async (ctx) => {
          // In resume path, input comes as { previousOutput, signal }; in start path, it is direct
          const raw = ctx.input as Record<string, unknown>;
          const input = (raw.previousOutput as Record<string, unknown> | undefined) ?? raw;
          const typed = input as {
            artifactId: string;
            action: string;
            suggestion?: string;
            reason?: string;
            workspaceId: string;
            error?: RuntimeError;
            target?: RecoveryTarget;
          };

          // Attempt to execute the proposed action
          let executionResult: { status: "executed" | "skipped" | "failed"; detail: string };
          try {
            if (typed.action === "retry") {
              // For retry: this would enqueue a new run attempt. In the current scaffolding,
              // we record the intent — the actual retry is triggered by the caller.
              executionResult = {
                status: "executed",
                detail: `retry proposed: ${typed.suggestion ?? "standard retry"}`
              };
            } else if (typed.action === "none") {
              executionResult = {
                status: "skipped",
                detail: `no recovery action available: ${typed.reason ?? "non-recoverable"}`
              };
            } else {
              executionResult = {
                status: "executed",
                detail: `action ${typed.action} executed`
              };
            }

            return {
              kind: "continue" as const,
              output: {
                artifactId: typed.artifactId,
                action: typed.action,
                executionResult,
                target: typed.target
              },
              next: "record_memory"
            };
          } catch (execError) {
            return {
              kind: "continue" as const,
              output: {
                artifactId: typed.artifactId,
                action: typed.action,
                executionResult: {
                  status: "failed" as const,
                  detail: execError instanceof Error ? execError.message : String(execError)
                },
                target: typed.target
              },
              next: "record_memory"
            };
          }
        }
      },

      // Step 7: Record a memory candidate for the failure pattern
      {
        stepId: "record_memory",
        run: (ctx) => {
          // In resume path, input comes as { previousOutput, signal }; in start path, it is direct
          const raw = ctx.input as Record<string, unknown>;
          const input = (raw.previousOutput as Record<string, unknown> | undefined) ?? raw;
          const typed = input as {
            artifactId: string;
            action: string;
            executionResult?: { status: "executed" | "skipped" | "failed"; detail: string };
            error?: RuntimeError;
            target?: RecoveryTarget;
            workspaceId: string;
            runAttemptId?: string;
          };

          const now = new Date().toISOString();
          const execResult = typed.executionResult ?? { status: "executed" as const, detail: "resumed from approval" };

          // Record a memory candidate for failure pattern analysis
          const memoryId = `mem_rec_${typed.artifactId}`;
          try {
            deps.memoryStore.createCandidate({
              id: memoryId,
              workspaceId: typed.workspaceId,
              scope: "run",
              kind: "failure_pattern",
              content: `Recovery action "${typed.action}" result: ${execResult.status} - ${execResult.detail}`,
              source: {
                artifactId: typed.artifactId,
                recoveryAction: typed.action,
                executionStatus: execResult.status,
                target: typed.target ?? null
              },
              confidence: execResult.status === "executed" ? 0.9 : 0.5,
              now
            });
          } catch {
            // Memory recording failure is non-fatal
          }

          // Complete the recovery workflow
          return {
            kind: "complete" as const,
            output: {
              artifactId: typed.artifactId,
              memoryId,
              action: typed.action,
              executionStatus: execResult.status
            }
          };
        }
      }
    ]
  };
}
