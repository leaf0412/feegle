import type { RuntimeDb } from "@infra/app/runtime-db.js";
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
  inputSummary?: unknown;
}

export interface WorkflowSummaryRow {
  id: string;
  status: string;
  currentStepId: string | null;
  definitionId: string | null;
}

export interface RunAttemptSummaryRow {
  id: string;
  status: string;
  workflowInstanceId: string;
  triggerEventId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ControlActionRow {
  id: string;
  actionType: string;
  status: string;
  actorUserId: string | null;
  createdAt: string;
}

export interface StepSummaryRow {
  id: string;
  stepId: string;
  status: string;
  runAttemptId: string;
}

export interface EffectSummaryRow {
  id: string;
  pluginId: string;
  effectType: string;
  status: string;
  runAttemptId: string;
}

export interface RunningAttemptRow {
  id: string;
  workflowInstanceId: string;
  status: string;
  createdAt: string;
}

export function encodeJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export function decodeJson(value: string | null): unknown {
  return value === null ? null : JSON.parse(value);
}

export interface QueueAttemptRow {
  id: string;
  workflowInstanceId: string;
  attemptCount: number;
  nextRunAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  status: string;
}

interface QueueAttemptDbRow {
  id: string;
  workflow_instance_id: string;
  attempt_count: number;
  next_run_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  status: string;
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

  /**
   * Returns a richer run attempt row including trigger_event_id, workflow_instance_id,
   * created_at, and finished_at. Used by RuntimeInspectionService for projection.
   */
  getRunAttemptDetail(id: string): RunAttemptSummaryRow | undefined {
    const row = this.db
      .prepare(
        `select id, status, workflow_instance_id, trigger_event_id, created_at, finished_at
         from run_attempts where id = ?`
      )
      .get(id) as {
        id: string;
        status: string;
        workflow_instance_id: string;
        trigger_event_id: string | null;
        created_at: string;
        finished_at: string | null;
      } | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      status: row.status,
      workflowInstanceId: row.workflow_instance_id,
      triggerEventId: row.trigger_event_id,
      createdAt: row.created_at,
      finishedAt: row.finished_at
    };
  }

  /**
   * Returns the workspace_id for a workflow instance. Used by projection queries.
   */
  getWorkflowWorkspaceId(workflowInstanceId: string): string | null {
    const row = this.db
      .prepare("select workspace_id from workflow_instances where id = ?")
      .get(workflowInstanceId) as { workspace_id: string } | undefined;
    return row?.workspace_id ?? null;
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

  getWorkflowInstance(id: string): { id: string; status: string; currentStepId: string | null; definitionId: string | null } | undefined {
    const row = this.db
      .prepare("select id, status, current_step_id, definition_id from workflow_instances where id = ?")
      .get(id) as { id: string; status: string; current_step_id: string | null; definition_id: string | null } | undefined;
    return row ? { id: row.id, status: row.status, currentStepId: row.current_step_id, definitionId: row.definition_id } : undefined;
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

  listWaitingStepStates(workflowInstanceId: string): Array<{
    id: string;
    workflowInstanceId: string;
    runAttemptId: string;
    stepId: string;
    status: "waiting";
    waitCondition: WaitCondition | null;
    input: unknown;
    output: unknown;
  }> {
    const rows = this.db
      .prepare(
        `select id, workflow_instance_id, run_attempt_id, step_id, status, wait_condition_json, input_json, output_json
         from step_states
         where workflow_instance_id = ? and status = 'waiting'
         order by created_at asc`
      )
      .all(workflowInstanceId) as Array<{
        id: string;
        workflow_instance_id: string;
        run_attempt_id: string;
        step_id: string;
        status: "waiting";
        wait_condition_json: string | null;
        input_json: string | null;
        output_json: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      runAttemptId: row.run_attempt_id,
      stepId: row.step_id,
      status: "waiting" as const,
      waitCondition: row.wait_condition_json !== null
        ? (JSON.parse(row.wait_condition_json) as WaitCondition)
        : null,
      input: decodeJson(row.input_json),
      output: decodeJson(row.output_json)
    }));
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

  listEffectExecutions(runAttemptId: string): Array<{
    id: string;
    pluginId: string;
    effectType: string;
    status: EffectStatus;
    idempotencyKey: string | null;
    outputSummary: unknown;
    error: RuntimeError | null;
  }> {
    const rows = this.db
      .prepare(
        `select id, plugin_id, effect_type, status, idempotency_key, output_summary_json, error_json
         from effect_executions
         where run_attempt_id = ?
         order by created_at asc`
      )
      .all(runAttemptId) as Array<{
        id: string;
        plugin_id: string;
        effect_type: string;
        status: EffectStatus;
        idempotency_key: string | null;
        output_summary_json: string | null;
        error_json: string | null;
      }>;

    return rows.map((row) => ({
      id: row.id,
      pluginId: row.plugin_id,
      effectType: row.effect_type,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      outputSummary: decodeJson(row.output_summary_json),
      error: row.error_json !== null ? (JSON.parse(row.error_json) as RuntimeError) : null
    }));
  }

  getEffectExecution(id: string): EffectExecutionView | undefined {
    const row = this.db
      .prepare("select id, status, output_summary_json, input_summary_json from effect_executions where id = ?")
      .get(id) as { id: string; status: EffectStatus; output_summary_json: string | null; input_summary_json: string | null } | undefined;
    return row
      ? { id: row.id, status: row.status, outputSummary: decodeJson(row.output_summary_json), inputSummary: decodeJson(row.input_summary_json) ?? undefined }
      : undefined;
  }

  getEffectExecutionByIdempotencyKey(key: string): EffectExecutionView | undefined {
    const row = this.db
      .prepare(
        "select id, status, output_summary_json, input_summary_json from effect_executions where idempotency_key = ?"
      )
      .get(key) as { id: string; status: EffectStatus; output_summary_json: string | null; input_summary_json: string | null } | undefined;
    return row
      ? { id: row.id, status: row.status, outputSummary: decodeJson(row.output_summary_json), inputSummary: decodeJson(row.input_summary_json) ?? undefined }
      : undefined;
  }

  // ---- Read-only projection queries ----

  listWorkflowSummaries(workspaceId: string): WorkflowSummaryRow[] {
    const rows = this.db
      .prepare(
        `select id, status, current_step_id, definition_id
         from workflow_instances
         where workspace_id = ?
         order by created_at desc`
      )
      .all(workspaceId) as Array<{
        id: string;
        status: string;
        current_step_id: string | null;
        definition_id: string | null;
      }>;
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      currentStepId: row.current_step_id,
      definitionId: row.definition_id
    }));
  }

  listRunAttempts(workflowInstanceId: string): RunAttemptSummaryRow[] {
    const rows = this.db
      .prepare(
        `select id, status, workflow_instance_id, trigger_event_id, created_at, finished_at
         from run_attempts
         where workflow_instance_id = ?
         order by created_at asc`
      )
      .all(workflowInstanceId) as Array<{
        id: string;
        status: string;
        workflow_instance_id: string;
        trigger_event_id: string | null;
        created_at: string;
        finished_at: string | null;
      }>;
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      workflowInstanceId: row.workflow_instance_id,
      triggerEventId: row.trigger_event_id,
      createdAt: row.created_at,
      finishedAt: row.finished_at
    }));
  }

  listStepSummaries(workflowInstanceId: string): StepSummaryRow[] {
    const rows = this.db
      .prepare(
        `select id, step_id, status, run_attempt_id
         from step_states
         where workflow_instance_id = ?
         order by created_at asc`
      )
      .all(workflowInstanceId) as Array<{
        id: string;
        step_id: string;
        status: string;
        run_attempt_id: string;
      }>;
    return rows.map((row) => ({
      id: row.id,
      stepId: row.step_id,
      status: row.status,
      runAttemptId: row.run_attempt_id
    }));
  }

  listEffectSummaries(runAttemptId: string): EffectSummaryRow[] {
    const rows = this.db
      .prepare(
        `select id, plugin_id, effect_type, status, run_attempt_id
         from effect_executions
         where run_attempt_id = ?
         order by created_at asc`
      )
      .all(runAttemptId) as Array<{
        id: string;
        plugin_id: string;
        effect_type: string;
        status: string;
        run_attempt_id: string;
      }>;
    return rows.map((row) => ({
      id: row.id,
      pluginId: row.plugin_id,
      effectType: row.effect_type,
      status: row.status,
      runAttemptId: row.run_attempt_id
    }));
  }

  listRunningAttemptsOlderThan(now: string, maxAgeMs: number): RunningAttemptRow[] {
    const cutoff = new Date(new Date(now).getTime() - maxAgeMs).toISOString();
    const rows = this.db
      .prepare(
        `select id, workflow_instance_id, status, created_at
         from run_attempts
         where status = 'running' and created_at < ?
         order by created_at asc`
      )
      .all(cutoff) as Array<{
        id: string;
        workflow_instance_id: string;
        status: string;
        created_at: string;
      }>;
    return rows.map((row) => ({
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      status: row.status,
      createdAt: row.created_at
    }));
  }

  // ---- Per-run projection queries (Plan 60 hard cutover observability) ----

  /**
   * Returns the most recent control_actions for a workspace. Read-only.
   */
  listLatestControlActions(workspaceId: string, limit: number = 10): ControlActionRow[] {
    const rows = this.db
      .prepare(
        `select id, action_type, status, actor_user_id, created_at
         from control_actions
         where workspace_id = ?
         order by created_at desc
         limit ?`
      )
      .all(workspaceId, limit) as Array<{
        id: string;
        action_type: string;
        status: string;
        actor_user_id: string | null;
        created_at: string;
      }>;
    return rows.map((row) => ({
      id: row.id,
      actionType: row.action_type,
      status: row.status,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at
    }));
  }

  // ---- Queue/lease operations ----

  enqueueAttempt(input: {
    id: string;
    workflowInstanceId: string;
    triggerEventId: string | null;
    nextRunAt: string | null;
    attemptCount: number;
    now: string;
  }): void {
    this.db
      .prepare(
        `insert into run_attempts
         (id, workflow_instance_id, status, trigger_event_id, next_run_at, attempt_count, created_at, updated_at)
         values (?, ?, 'queued', ?, ?, ?, ?, ?)`
      )
      .run(input.id, input.workflowInstanceId, input.triggerEventId, input.nextRunAt, input.attemptCount, input.now, input.now);
  }

  claimNextAttempt(input: {
    workerId: string;
    leaseExpiresAt: string;
    now: string;
  }): QueueAttemptRow | undefined {
    const claimFn = this.db.transaction((workerId: string, leaseExpiresAt: string, now: string) => {
      const candidate = this.db
        .prepare(
          `select id from run_attempts
           where status = 'queued'
           and (next_run_at is null or next_run_at <= ?)
           and (lease_expires_at is null or lease_expires_at <= ?)
           order by created_at asc
           limit 1`
        )
        .get(now, now) as { id: string } | undefined;

      if (!candidate) return undefined;

      this.db
        .prepare(
          `update run_attempts
           set lease_owner = ?, lease_expires_at = ?, locked_at = ?, status = 'running'
           where id = ?`
        )
        .run(workerId, leaseExpiresAt, now, candidate.id);

      return this.db
        .prepare(
          `select id, workflow_instance_id, attempt_count, next_run_at, lease_owner, lease_expires_at, status
           from run_attempts where id = ?`
        )
        .get(candidate.id) as QueueAttemptDbRow | undefined;
    });

    const row = claimFn(input.workerId, input.leaseExpiresAt, input.now);
    if (!row) return undefined;
    return {
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      attemptCount: row.attempt_count,
      nextRunAt: row.next_run_at,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      status: row.status
    };
  }

  renewLease(input: {
    attemptId: string;
    leaseOwner: string;
    leaseExpiresAt: string;
  }): boolean {
    const result = this.db
      .prepare(
        `update run_attempts set lease_expires_at = ?
         where id = ? and lease_owner = ? and status = 'running'`
      )
      .run(input.leaseExpiresAt, input.attemptId, input.leaseOwner);
    return result.changes > 0;
  }

  completeAttempt(input: {
    attemptId: string;
    leaseOwner: string;
    now: string;
  }): void {
    this.db
      .prepare(
        `update run_attempts
         set status = 'succeeded', lease_owner = null, lease_expires_at = null, locked_at = null,
             finished_at = ?, updated_at = ?
         where id = ? and lease_owner = ?`
      )
      .run(input.now, input.now, input.attemptId, input.leaseOwner);
  }

  failAttempt(input: {
    attemptId: string;
    leaseOwner: string;
    nextRunAt: string | null;
    error: RuntimeError | null;
    now: string;
  }): void {
    const newStatus = input.nextRunAt ? 'queued' : 'failed';
    this.db
      .prepare(
        `update run_attempts
         set status = ?, lease_owner = null, lease_expires_at = null, locked_at = null,
             next_run_at = ?, error_json = ?, finished_at = ?, updated_at = ?
         where id = ? and lease_owner = ?`
      )
      .run(newStatus, input.nextRunAt, encodeJson(input.error), input.now, input.now, input.attemptId, input.leaseOwner);
  }

  releaseAttempt(input: {
    attemptId: string;
    leaseOwner: string;
    now: string;
  }): void {
    this.db
      .prepare(
        `update run_attempts
         set status = 'queued', lease_owner = null, lease_expires_at = null, locked_at = null, updated_at = ?
         where id = ? and lease_owner = ?`
      )
      .run(input.now, input.attemptId, input.leaseOwner);
  }

  getExpiredLeases(now: string): Array<{
    id: string;
    workflowInstanceId: string;
    leaseOwner: string;
    leaseExpiresAt: string;
  }> {
    const rows = this.db
      .prepare(
        `select id, workflow_instance_id, lease_owner, lease_expires_at
         from run_attempts
         where status = 'running' and lease_expires_at is not null and lease_expires_at <= ?`
      )
      .all(now) as Array<{
        id: string;
        workflow_instance_id: string;
        lease_owner: string;
        lease_expires_at: string;
      }>;
    return rows.map((r) => ({
      id: r.id,
      workflowInstanceId: r.workflow_instance_id,
      leaseOwner: r.lease_owner,
      leaseExpiresAt: r.lease_expires_at
    }));
  }

  getQueuedAttempt(id: string): QueueAttemptRow | undefined {
    const row = this.db
      .prepare(
        `select id, workflow_instance_id, attempt_count, next_run_at, lease_owner, lease_expires_at, status
         from run_attempts where id = ?`
      )
      .get(id) as QueueAttemptDbRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      attemptCount: row.attempt_count,
      nextRunAt: row.next_run_at,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      status: row.status
    };
  }

  listRunningAttemptsForDefinition(definitionId: string): Array<{
    id: string;
    workflowInstanceId: string;
  }> {
    const rows = this.db
      .prepare(
        `select ra.id, ra.workflow_instance_id
         from run_attempts ra
         inner join workflow_instances wi on ra.workflow_instance_id = wi.id
         where wi.definition_id = ? and ra.status in ('queued', 'running', 'waiting')
         order by ra.created_at asc`
      )
      .all(definitionId) as Array<{
      id: string;
      workflow_instance_id: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      workflowInstanceId: r.workflow_instance_id
    }));
  }
}
