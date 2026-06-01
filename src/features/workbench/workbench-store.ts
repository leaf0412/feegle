import type { RuntimeDb } from "@infra/app/runtime-db.js";
import type { ChatWorkbenchState } from "@features/workbench/workbench-models.js";

export class WorkbenchStore {
  constructor(
    private readonly db: RuntimeDb,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getOrCreate(chatId: string): ChatWorkbenchState {
    const row = this.db
      .prepare("select * from chat_workbench where chat_id = ?")
      .get(chatId) as Row | undefined;
    if (row) return this.toState(row);
    const updatedAt = this.now().toISOString();
    this.db
      .prepare(
        `insert into chat_workbench (chat_id, updated_at) values (?, ?)`,
      )
      .run(chatId, updatedAt);
    return {
      chatId,
      repositories: [],
      requirementText: null,
      requirementDocUrl: null,
      requirementVersion: 0,
      planText: null,
      planDocUrl: null,
      planVersion: 0,
      planStale: false,
      updatedAt,
    };
  }

  addRepository(chatId: string, url: string): void {
    const state = this.getOrCreate(chatId);
    if (state.repositories.includes(url)) return;
    const repos = [...state.repositories, url];
    this.db
      .prepare(
        `update chat_workbench set repositories = ?, updated_at = ? where chat_id = ?`,
      )
      .run(JSON.stringify(repos), this.now().toISOString(), chatId);
  }

  removeRepository(chatId: string, url: string): void {
    const state = this.getOrCreate(chatId);
    const repos = state.repositories.filter((r) => r !== url);
    this.db
      .prepare(
        `update chat_workbench set repositories = ?, updated_at = ? where chat_id = ?`,
      )
      .run(JSON.stringify(repos), this.now().toISOString(), chatId);
  }

  setRequirement(chatId: string, text: string, docUrl: string): void {
    this.getOrCreate(chatId);
    this.db
      .prepare(
        `update chat_workbench
         set req_text = ?, req_doc_url = ?, req_version = req_version + 1, updated_at = ?
         where chat_id = ?`,
      )
      .run(text, docUrl, this.now().toISOString(), chatId);
  }

  markPlanStale(chatId: string): void {
    this.getOrCreate(chatId);
    this.db
      .prepare(
        `update chat_workbench set plan_stale = 1, updated_at = ? where chat_id = ?`,
      )
      .run(this.now().toISOString(), chatId);
  }

  setPlan(chatId: string, text: string, docUrl: string): void {
    this.getOrCreate(chatId);
    this.db
      .prepare(
        `update chat_workbench
         set plan_text = ?, plan_doc_url = ?, plan_version = plan_version + 1,
             plan_stale = 0, updated_at = ?
         where chat_id = ?`,
      )
      .run(text, docUrl, this.now().toISOString(), chatId);
  }

  deletePlan(chatId: string): void {
    this.getOrCreate(chatId);
    this.db
      .prepare(
        `update chat_workbench
         set plan_text = null, plan_doc_url = null, plan_version = 0,
             plan_stale = 0, updated_at = ?
         where chat_id = ?`,
      )
      .run(this.now().toISOString(), chatId);
  }

  deleteRequirement(chatId: string): void {
    this.getOrCreate(chatId);
    this.db
      .prepare(
        `update chat_workbench
         set req_text = null, req_doc_url = null, req_version = 0,
             plan_text = null, plan_doc_url = null, plan_version = 0,
             plan_stale = 0, updated_at = ?
         where chat_id = ?`,
      )
      .run(this.now().toISOString(), chatId);
  }

  private toState(row: Row): ChatWorkbenchState {
    return {
      chatId: row.chat_id,
      repositories: JSON.parse(row.repositories) as string[],
      requirementText: row.req_text,
      requirementDocUrl: row.req_doc_url,
      requirementVersion: row.req_version,
      planText: row.plan_text,
      planDocUrl: row.plan_doc_url,
      planVersion: row.plan_version,
      planStale: row.plan_stale === 1,
      updatedAt: row.updated_at,
    };
  }
}

interface Row {
  chat_id: string;
  repositories: string;
  req_text: string | null;
  req_doc_url: string | null;
  req_version: number;
  plan_text: string | null;
  plan_doc_url: string | null;
  plan_version: number;
  plan_stale: number;
  updated_at: string;
}
