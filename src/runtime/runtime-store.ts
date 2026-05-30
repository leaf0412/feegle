import type { RuntimeDb } from "../app/runtime-db.js";
import type { ConcurrencyPolicy, RunAttemptStatus } from "./runtime-models.js";

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
}
