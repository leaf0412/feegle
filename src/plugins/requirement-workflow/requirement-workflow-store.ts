import { randomBytes } from "node:crypto";
import type { RuntimeDb } from "@infra/app/runtime-db.js";
import type { RequirementWorkflowRecord, RequirementWorkflowStatus } from "./requirement-workflow-models.js";

interface DbRequirementWorkflowRow {
  requirement_id: string;
  workspace_id: string;
  project_id: string | null;
  conversation_key: string;
  requester_user_id: string;
  status: string;
  title: string;
  requirement_text: string;
  current_plan_version: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbRequirementWorkflowRow): RequirementWorkflowRecord {
  return {
    requirementId: row.requirement_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    conversationKey: row.conversation_key,
    requesterUserId: row.requester_user_id,
    status: row.status as RequirementWorkflowStatus,
    title: row.title,
    requirementText: row.requirement_text,
    currentPlanVersion: row.current_plan_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function generateRequirementId(): string {
  const timestamp = Date.now();
  const random = randomBytes(8).toString("base64url");
  return `reqwf_${timestamp}_${random}`;
}

export class RequirementWorkflowStore {
  constructor(private readonly db: RuntimeDb) {
    this.db.exec(`
      create table if not exists requirement_workflows (
        requirement_id text primary key,
        workspace_id text not null,
        project_id text,
        conversation_key text not null,
        requester_user_id text not null,
        status text not null,
        title text not null,
        requirement_text text not null,
        current_plan_version integer not null default 0,
        created_at text not null,
        updated_at text not null
      );
      create index if not exists requirement_workflows_workspace_idx
        on requirement_workflows(workspace_id, status);
    `);
  }

  createIntake(input: {
    workspaceId: string;
    projectId: string | null;
    conversationKey: string;
    requesterUserId: string;
    title: string;
    requirementText: string;
  }): RequirementWorkflowRecord {
    const now = new Date().toISOString();
    const record: RequirementWorkflowRecord = {
      requirementId: generateRequirementId(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      conversationKey: input.conversationKey,
      requesterUserId: input.requesterUserId,
      status: "intake_received",
      title: input.title,
      requirementText: input.requirementText,
      currentPlanVersion: 0,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `insert into requirement_workflows
          (requirement_id, workspace_id, project_id, conversation_key, requester_user_id,
           status, title, requirement_text, current_plan_version, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.requirementId,
        record.workspaceId,
        record.projectId,
        record.conversationKey,
        record.requesterUserId,
        record.status,
        record.title,
        record.requirementText,
        record.currentPlanVersion,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  get(requirementId: string): RequirementWorkflowRecord | undefined {
    const row = this.db
      .prepare(
        `select requirement_id, workspace_id, project_id, conversation_key, requester_user_id,
                status, title, requirement_text, current_plan_version, created_at, updated_at
         from requirement_workflows
         where requirement_id = ?`
      )
      .get(requirementId) as DbRequirementWorkflowRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  setStatus(input: {
    requirementId: string;
    expected: RequirementWorkflowStatus;
    next: RequirementWorkflowStatus;
  }): RequirementWorkflowRecord {
    const current = this.get(input.requirementId);
    const actualStatus = current?.status ?? "missing";

    if (!current || current.status !== input.expected) {
      throw new Error(
        `Unexpected requirement workflow status for ${input.requirementId}: expected ${input.expected}, found ${actualStatus}`
      );
    }

    const updatedAt = new Date().toISOString();

    this.db
      .prepare(
        `update requirement_workflows set status = ?, updated_at = ? where requirement_id = ?`
      )
      .run(input.next, updatedAt, input.requirementId);

    const updated = this.get(input.requirementId);
    if (!updated) {
      throw new Error(`Requirement workflow ${input.requirementId} disappeared after status update`);
    }

    return updated;
  }
}
