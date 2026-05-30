import type { RuntimeDb } from "../app/runtime-db.js";
import type {
  ConcurrencyPolicy,
  EffectStatus,
  RunAttemptStatus,
  RuntimeError,
  StepStatus,
  WaitCondition
} from "./runtime-models.js";

export interface StepStateView {
  id: string;
  status: StepStatus;
  output: unknown;
}

export interface RuntimeEventView {
  id: string;
  type: string;
  payload: unknown;
}

export interface EffectExecutionView {
  id: string;
  status: EffectStatus;
  outputSummary: unknown;
}

export function encodeJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function decodeJson(value: string | null): unknown {
  return value === null ? null : JSON.parse(value);
}

export class RuntimeStore {
  constructor(private readonly db: RuntimeDb) {}

  registerWorkflowDefinition(input: {
    id: string;
    version: number;
    concurrencyPolicy: ConcurrencyPolicy;
    now: string;
  }): void {
    this.db
      .prepare(
        `insert into workflow_definitions (id, version, concurrency_policy, created_at, updated_at)
         values (?, ?, ?, ?, ?)
         on conflict(id) do update set
          version = excluded.version,
          concurrency_policy = excluded.concurrency_policy,
          updated_at = excluded.updated_at`
      )
      .run(input.id, input.version, input.concurrencyPolicy, input.now, input.now);
  }

  createWorkflowInstance(input: {
    id: string;
    workspaceId: string;
    projectId: string | null;
    definitionId: string;
    definitionVersion: number;
    status: string;
    now: string;
  }): void {
    this.db
      .prepare(
        `insert into workflow_instances
          (id, workspace_id, project_id, definition_id, definition_version, status, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.workspaceId,
        input.projectId,
        input.definitionId,
        input.definitionVersion,
        input.status,
        input.now,
        input.now
      );
  }

  createRunAttempt(input: {
    id: string;
    workflowInstanceId: string;
    status: RunAttemptStatus;
    triggerEventId: string | null;
    now: string;
  }): void {
    this.db
      .prepare(
        `insert into run_attempts
          (id, workflow_instance_id, status, trigger_event_id, started_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.workflowInstanceId,
        input.status,
        input.triggerEventId,
        input.now,
        input.now,
        input.now
      );
  }

  getActiveMutatingAttempt(
    workflowInstanceId: string
  ): { id: string; status: RunAttemptStatus } | undefined {
    return this.db
      .prepare(
        `select id, status from run_attempts
         where workflow_instance_id = ? and status in ('pending', 'running', 'waiting')
         order by created_at asc
         limit 1`
      )
      .get(workflowInstanceId) as { id: string; status: RunAttemptStatus } | undefined;
  }

  markRunningAttemptsInterrupted(now: string): number {
    const result = this.db
      .prepare(
        `update run_attempts
         set status = 'interrupted', finished_at = ?, updated_at = ?
         where status = 'running'`
      )
      .run(now, now);

    return result.changes;
  }

  getRunAttempt(id: string): { id: string; status: RunAttemptStatus } | undefined {
    return this.db
      .prepare("select id, status from run_attempts where id = ?")
      .get(id) as { id: string; status: RunAttemptStatus } | undefined;
  }

  finishRunAttempt(input: {
    id: string;
    status: RunAttemptStatus;
    error: RuntimeError | null;
    now: string;
  }): void {
    this.db
      .prepare("update run_attempts set status = ?, error_json = ?, finished_at = ?, updated_at = ? where id = ?")
      .run(input.status, encodeJson(input.error), input.now, input.now, input.id);
  }

  updateWorkflowInstanceStatus(input: {
    id: string;
    status: string;
    currentStepId: string | null;
    now: string;
  }): void {
    this.db
      .prepare("update workflow_instances set status = ?, current_step_id = ?, updated_at = ? where id = ?")
      .run(input.status, input.currentStepId, input.now, input.id);
  }

  getWorkflowInstance(id: string): { id: string; status: string; currentStepId: string | null } | undefined {
    const row = this.db
      .prepare("select id, status, current_step_id from workflow_instances where id = ?")
      .get(id) as { id: string; status: string; current_step_id: string | null } | undefined;
    return row ? { id: row.id, status: row.status, currentStepId: row.current_step_id } : undefined;
  }

  createStepState(input: {
    id: string;
    workflowInstanceId: string;
    runAttemptId: string | null;
    stepId: string;
    status: StepStatus;
    input: unknown;
    now: string;
  }): void {
    this.db
      .prepare(
        `insert into step_states
          (id, workflow_instance_id, run_attempt_id, step_id, status, input_json, started_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.workflowInstanceId,
        input.runAttemptId,
        input.stepId,
        input.status,
        encodeJson(input.input),
        input.now,
        input.now,
        input.now
      );
  }

  updateStepState(input: {
    id: string;
    status: StepStatus;
    output: unknown;
    waitCondition: WaitCondition | null;
    error: RuntimeError | null;
    now: string;
  }): void {
    this.db
      .prepare(
        `update step_states
         set status = ?, output_json = ?, wait_condition_json = ?, error_json = ?, finished_at = ?, updated_at = ?
         where id = ?`
      )
      .run(
        input.status,
        encodeJson(input.output),
        encodeJson(input.waitCondition),
        encodeJson(input.error),
        input.now,
        input.now,
        input.id
      );
  }

  appendRuntimeEvent(input: {
    id: string;
    workspaceId: string;
    workflowInstanceId: string | null;
    runAttemptId: string | null;
    stepStateId: string | null;
    effectExecutionId: string | null;
    category: string;
    type: string;
    payload: unknown;
    now: string;
  }): void {
    this.db
      .prepare(
        `insert into runtime_events
          (id, workspace_id, workflow_instance_id, run_attempt_id, step_state_id, effect_execution_id, category, type, payload_json, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.workspaceId,
        input.workflowInstanceId,
        input.runAttemptId,
        input.stepStateId,
        input.effectExecutionId,
        input.category,
        input.type,
        JSON.stringify(input.payload),
        input.now
      );
  }

  getStepState(id: string): StepStateView | undefined {
    const row = this.db
      .prepare("select id, status, output_json from step_states where id = ?")
      .get(id) as { id: string; status: StepStatus; output_json: string | null } | undefined;
    return row ? { id: row.id, status: row.status, output: decodeJson(row.output_json) } : undefined;
  }

  listRuntimeEvents(workflowInstanceId: string): RuntimeEventView[] {
    const rows = this.db
      .prepare(
        `select id, type, payload_json
         from runtime_events
         where workflow_instance_id = ?
         order by created_at asc, rowid asc`
      )
      .all(workflowInstanceId) as Array<{ id: string; type: string; payload_json: string }>;
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload_json)
    }));
  }

  createEffectExecution(input: {
    id: string;
    runAttemptId: string;
    stepStateId: string | null;
    pluginId: string;
    effectType: string;
    status: EffectStatus;
    idempotencyKey: string | null;
    inputSummary: unknown;
    now: string;
  }): void {
    this.db
      .prepare(
        `insert into effect_executions
          (id, run_attempt_id, step_state_id, plugin_id, effect_type, status, idempotency_key, input_summary_json, started_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.id,
        input.runAttemptId,
        input.stepStateId,
        input.pluginId,
        input.effectType,
        input.status,
        input.idempotencyKey,
        encodeJson(input.inputSummary),
        input.now,
        input.now,
        input.now
      );
  }

  updateEffectExecution(input: {
    id: string;
    status: EffectStatus;
    outputSummary: unknown;
    error: RuntimeError | null;
    now: string;
  }): void {
    this.db
      .prepare(
        `update effect_executions
         set status = ?, output_summary_json = ?, error_json = ?, finished_at = ?, updated_at = ?
         where id = ?`
      )
      .run(
        input.status,
        encodeJson(input.outputSummary),
        encodeJson(input.error),
        input.now,
        input.now,
        input.id
      );
  }

  getEffectExecution(id: string): EffectExecutionView | undefined {
    const row = this.db
      .prepare("select id, status, output_summary_json from effect_executions where id = ?")
      .get(id) as { id: string; status: EffectStatus; output_summary_json: string | null } | undefined;
    return row
      ? { id: row.id, status: row.status, outputSummary: decodeJson(row.output_summary_json) }
      : undefined;
  }

  getEffectExecutionByIdempotencyKey(key: string): EffectExecutionView | undefined {
    const row = this.db
      .prepare(
        "select id, status, output_summary_json from effect_executions where idempotency_key = ?"
      )
      .get(key) as { id: string; status: EffectStatus; output_summary_json: string | null } | undefined;
    return row
      ? { id: row.id, status: row.status, outputSummary: decodeJson(row.output_summary_json) }
      : undefined;
  }
}
