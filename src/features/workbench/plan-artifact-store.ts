import type { RuntimeDb } from "../../infra/app/runtime-db.js";

export type PlanArtifactStatus =
  | "pending_review"
  | "pending_base"
  | "approved"
  | "executing"
  | "completed"
  | "pushed"
  | "cancelled"
  | "cleaned"
  | "failed";

export interface IterationNote {
  iteration: number;
  note: string | null;
  headShaBefore: string | null;
  headShaAfter: string;
  commitCountDelta: number;
  filesChangedDelta: number;
  startedAt: string;
  completedAt: string;
}

export interface PlanArtifact {
  planId: string;
  chatId: string;
  sourceMessageId: string;
  provider: string;
  workspacePath: string;
  version: number;
  filePath: string;
  feishuFileMessageId?: string;
  docToken?: string;
  docUrl?: string;
  status: PlanArtifactStatus;
  revisionNote?: string;
  baseBranch?: string;
  baseSha?: string;
  headBranch?: string;
  headSha?: string;
  worktreePath?: string;
  commitCount?: number;
  filesChanged?: number;
  executionIteration: number;
  iterationNotes: IterationNote[];
  progressCardMessageId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanArtifactVersionInput {
  planId: string;
  chatId: string;
  sourceMessageId: string;
  provider: string;
  workspacePath: string;
  version: number;
  filePath: string;
  feishuFileMessageId?: string;
  docToken?: string;
  docUrl?: string;
  status: PlanArtifactStatus;
  revisionNote?: string;
}

interface PlanArtifactRow {
  plan_id: string;
  chat_id: string;
  source_message_id: string;
  provider: string;
  workspace_path: string;
  version: number;
  file_path: string;
  feishu_file_message_id: string | null;
  doc_token: string | null;
  doc_url: string | null;
  status: PlanArtifactStatus;
  revision_note: string | null;
  base_branch: string | null;
  base_sha: string | null;
  head_branch: string | null;
  head_sha: string | null;
  worktree_path: string | null;
  commit_count: number | null;
  files_changed: number | null;
  execution_iteration: number;
  iteration_notes: string | null;
  progress_card_message_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class PlanArtifactStore {
  constructor(
    private readonly db: RuntimeDb,
    private readonly now: () => Date = () => new Date()
  ) {}

  createVersion(input: CreatePlanArtifactVersionInput): PlanArtifact {
    const nowIso = this.now().toISOString();
    this.db
      .prepare(
        `insert into plan_artifacts
          (plan_id, chat_id, source_message_id, provider, workspace_path, version,
           file_path, feishu_file_message_id, doc_token, doc_url, status, revision_note,
           execution_iteration, iteration_notes, created_at, updated_at)
         values
          (@planId, @chatId, @sourceMessageId, @provider, @workspacePath, @version,
           @filePath, @feishuFileMessageId, @docToken, @docUrl, @status, @revisionNote,
           1, '[]', @createdAt, @updatedAt)`
      )
      .run({
        planId: input.planId,
        chatId: input.chatId,
        sourceMessageId: input.sourceMessageId,
        provider: input.provider,
        workspacePath: input.workspacePath,
        version: input.version,
        filePath: input.filePath,
        feishuFileMessageId: input.feishuFileMessageId ?? null,
        docToken: input.docToken ?? null,
        docUrl: input.docUrl ?? null,
        status: input.status,
        revisionNote: input.revisionNote ?? null,
        createdAt: nowIso,
        updatedAt: nowIso
      });
    return {
      ...input,
      executionIteration: 1,
      iterationNotes: [],
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  latest(planId: string): PlanArtifact | undefined {
    const row = this.db
      .prepare("select * from plan_artifacts where plan_id = ? order by version desc limit 1")
      .get(planId) as PlanArtifactRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  listByChat(chatId: string): PlanArtifact[] {
    const rows = this.db
      .prepare("select * from plan_artifacts where chat_id = ? order by plan_id asc, version asc")
      .all(chatId) as PlanArtifactRow[];
    return rows.map(fromRow);
  }

  markStatus(planId: string, version: number, status: PlanArtifactStatus): void {
    const result = this.db
      .prepare(
        `update plan_artifacts
         set status = ?, updated_at = ?
         where plan_id = ? and version = ?`
      )
      .run(status, this.now().toISOString(), planId, version);
    if (result.changes === 0) {
      throw new Error(`plan artifact not found: ${planId}@v${version}`);
    }
  }

  setStatus(
    planId: string,
    input: { status: PlanArtifactStatus; expectedStatus: PlanArtifactStatus; errorMessage?: string }
  ): void {
    const result = this.db
      .prepare(
        `update plan_artifacts
         set status = @status,
             error_message = coalesce(@errorMessage, error_message),
             updated_at = @updatedAt
         where plan_id = @planId and status = @expectedStatus`
      )
      .run({
        status: input.status,
        expectedStatus: input.expectedStatus,
        errorMessage: input.errorMessage ?? null,
        planId,
        updatedAt: this.now().toISOString()
      });
    if (result.changes === 0) {
      throw new Error(`state conflict: ${planId} expected ${input.expectedStatus} -> ${input.status}`);
    }
  }

  setBaseBranch(
    planId: string,
    input: {
      baseBranch: string;
      headBranch: string;
      expectedStatus: PlanArtifactStatus;
    }
  ): void {
    const result = this.db
      .prepare(
        `update plan_artifacts
         set base_branch = @baseBranch,
             head_branch = @headBranch,
             updated_at = @updatedAt
         where plan_id = @planId and status = @expectedStatus`
      )
      .run({
        baseBranch: input.baseBranch,
        headBranch: input.headBranch,
        planId,
        expectedStatus: input.expectedStatus,
        updatedAt: this.now().toISOString()
      });
    if (result.changes === 0) {
      throw new Error(`state conflict: ${planId} setBaseBranch (expected ${input.expectedStatus})`);
    }
  }

  setExecution(
    planId: string,
    input: {
      baseSha: string;
      headBranch: string;
      worktreePath: string;
      progressCardMessageId?: string;
      status: PlanArtifactStatus;
      expectedStatus: PlanArtifactStatus;
    }
  ): void {
    const result = this.db
      .prepare(
        `update plan_artifacts
         set base_sha = @baseSha,
             head_branch = @headBranch,
             worktree_path = @worktreePath,
             progress_card_message_id = coalesce(@progressCardMessageId, progress_card_message_id),
             status = @status,
             updated_at = @updatedAt
         where plan_id = @planId and status = @expectedStatus`
      )
      .run({
        baseSha: input.baseSha,
        headBranch: input.headBranch,
        worktreePath: input.worktreePath,
        progressCardMessageId: input.progressCardMessageId ?? null,
        status: input.status,
        expectedStatus: input.expectedStatus,
        planId,
        updatedAt: this.now().toISOString()
      });
    if (result.changes === 0) {
      throw new Error(`state conflict: ${planId} setExecution (expected ${input.expectedStatus})`);
    }
  }

  setHeadInfo(
    planId: string,
    input: {
      headSha: string;
      commitCount: number;
      filesChanged: number;
      status: PlanArtifactStatus;
      expectedStatus: PlanArtifactStatus;
    }
  ): void {
    const result = this.db
      .prepare(
        `update plan_artifacts
         set head_sha = @headSha,
             commit_count = @commitCount,
             files_changed = @filesChanged,
             status = @status,
             updated_at = @updatedAt
         where plan_id = @planId and status = @expectedStatus`
      )
      .run({
        headSha: input.headSha,
        commitCount: input.commitCount,
        filesChanged: input.filesChanged,
        status: input.status,
        expectedStatus: input.expectedStatus,
        planId,
        updatedAt: this.now().toISOString()
      });
    if (result.changes === 0) {
      throw new Error(`state conflict: ${planId} setHeadInfo (expected ${input.expectedStatus})`);
    }
  }

  setProgressCardMessageId(planId: string, messageId: string): void {
    this.db
      .prepare(
        `update plan_artifacts
         set progress_card_message_id = @messageId,
             updated_at = @updatedAt
         where plan_id = @planId`
      )
      .run({ messageId, planId, updatedAt: this.now().toISOString() });
  }

  bumpIteration(planId: string, expectedStatus: PlanArtifactStatus, nextStatus: PlanArtifactStatus): number {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare(
          "select execution_iteration, status from plan_artifacts where plan_id = ? order by version desc limit 1"
        )
        .get(planId) as { execution_iteration: number; status: PlanArtifactStatus } | undefined;
      if (!row) throw new Error(`plan artifact not found: ${planId}`);
      if (row.status !== expectedStatus) {
        throw new Error(`state conflict: ${planId} bumpIteration (expected ${expectedStatus}, got ${row.status})`);
      }
      const next = row.execution_iteration + 1;
      this.db
        .prepare(
          `update plan_artifacts
           set execution_iteration = @next,
               status = @nextStatus,
               updated_at = @updatedAt
           where plan_id = @planId and status = @expectedStatus`
        )
        .run({
          next,
          nextStatus,
          planId,
          expectedStatus,
          updatedAt: this.now().toISOString()
        });
      return next;
    });
    return tx();
  }

  appendIterationNote(planId: string, note: IterationNote): void {
    const tx = this.db.transaction(() => {
      const row = this.db
        .prepare("select iteration_notes from plan_artifacts where plan_id = ? order by version desc limit 1")
        .get(planId) as { iteration_notes: string | null } | undefined;
      if (!row) throw new Error(`plan artifact not found: ${planId}`);
      const existing = row.iteration_notes ? (JSON.parse(row.iteration_notes) as IterationNote[]) : [];
      existing.push(note);
      this.db
        .prepare(
          `update plan_artifacts
           set iteration_notes = @notes,
               execution_iteration = @iteration,
               updated_at = @updatedAt
           where plan_id = @planId`
        )
        .run({
          notes: JSON.stringify(existing),
          iteration: note.iteration,
          planId,
          updatedAt: this.now().toISOString()
        });
    });
    tx();
  }
}

function fromRow(row: PlanArtifactRow): PlanArtifact {
  return {
    planId: row.plan_id,
    chatId: row.chat_id,
    sourceMessageId: row.source_message_id,
    provider: row.provider,
    workspacePath: row.workspace_path,
    version: row.version,
    filePath: row.file_path,
    ...(row.feishu_file_message_id ? { feishuFileMessageId: row.feishu_file_message_id } : {}),
    ...(row.doc_token ? { docToken: row.doc_token } : {}),
    ...(row.doc_url ? { docUrl: row.doc_url } : {}),
    status: row.status,
    ...(row.revision_note ? { revisionNote: row.revision_note } : {}),
    ...(row.base_branch ? { baseBranch: row.base_branch } : {}),
    ...(row.base_sha ? { baseSha: row.base_sha } : {}),
    ...(row.head_branch ? { headBranch: row.head_branch } : {}),
    ...(row.head_sha ? { headSha: row.head_sha } : {}),
    ...(row.worktree_path ? { worktreePath: row.worktree_path } : {}),
    ...(row.commit_count !== null ? { commitCount: row.commit_count } : {}),
    ...(row.files_changed !== null ? { filesChanged: row.files_changed } : {}),
    executionIteration: row.execution_iteration,
    iterationNotes: row.iteration_notes ? (JSON.parse(row.iteration_notes) as IterationNote[]) : [],
    ...(row.progress_card_message_id ? { progressCardMessageId: row.progress_card_message_id } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
