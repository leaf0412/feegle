import type { RuntimeDb } from "../app/runtime-db.js";

export type PlanArtifactStatus = "pending_review" | "approved" | "cancelled";

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
           file_path, feishu_file_message_id, doc_token, doc_url, status, revision_note, created_at, updated_at)
         values
          (@planId, @chatId, @sourceMessageId, @provider, @workspacePath, @version,
           @filePath, @feishuFileMessageId, @docToken, @docUrl, @status, @revisionNote, @createdAt, @updatedAt)`
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
