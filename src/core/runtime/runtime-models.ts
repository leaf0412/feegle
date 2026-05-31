export const runAttemptStatuses = [
  "pending",
  "queued",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "interrupted",
  "cancelled"
] as const;

export const stepStatuses = [
  "pending",
  "running",
  "waiting",
  "succeeded",
  "failed",
  "skipped",
  "cancelled"
] as const;

export const effectStatuses = ["pending", "running", "succeeded", "failed", "cancelled"] as const;

export const concurrencyPolicies = [
  "reject_if_running",
  "queue_if_running",
  "skip_if_running",
  "allow_readonly_parallel"
] as const;

export type RunAttemptStatus = (typeof runAttemptStatuses)[number];
export type StepStatus = (typeof stepStatuses)[number];
export type EffectStatus = (typeof effectStatuses)[number];
export type ConcurrencyPolicy = (typeof concurrencyPolicies)[number];

export interface RuntimeError {
  code: string;
  category:
    | "platform_input"
    | "permission"
    | "routing"
    | "precondition"
    | "capability"
    | "agent_process"
    | "agent_protocol"
    | "persistence"
    | "rendering"
    | "timeout"
    | "validation"
    | "unknown";
  message: string;
  retryable: boolean;
  recoverable: boolean;
  stack?: string;
  cause?: RuntimeError;
  evidence?: Record<string, unknown>;
}

export type WaitCondition =
  | { kind: "control_action"; action: string }
  | { kind: "external_callback"; callbackType: string }
  | { kind: "delay"; resumeAt: string };

export interface WorkflowSignal {
  signalId: string;
  kind: "control_action" | "external_callback";
  payload: {
    action?: string;
    callbackType?: string;
    [key: string]: unknown;
  };
  actor?: { kind: "user"; userId: string } | { kind: "system" };
}

export type StepResult =
  | { kind: "continue"; output?: unknown; next?: string }
  | { kind: "wait"; reason: string; waitFor: WaitCondition; output?: unknown }
  | { kind: "fail"; error: RuntimeError; recoverable: boolean }
  | { kind: "complete"; output?: unknown };

export interface WorkflowStep {
  stepId: string;
  run(ctx: WorkflowStepContext): Promise<StepResult> | StepResult;
}

export interface EffectInput {
  pluginId: string;
  effectType: string;
  input: unknown;
  idempotencyKey?: string;
}

export interface ActiveMemorySummary {
  id: string;
  kind: string;
  scope: string;
  content: string;
}

export interface MemorySearchParams {
  scope?: string;
  kind?: string;
  query?: string;
}

export interface WorkflowStepContext {
  workflowInstanceId: string;
  runAttemptId: string;
  input: unknown;
  executeEffect(effect: EffectInput): Promise<unknown>;
  memory?: {
    searchActive(params: MemorySearchParams): ActiveMemorySummary[];
  };
}

export interface WorkflowDefinition {
  definitionId: string;
  version: number;
  concurrencyPolicy: ConcurrencyPolicy;
  steps: readonly WorkflowStep[];
}
