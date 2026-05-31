import type { RuntimeDb } from "../../app/runtime-db.js";

export type FollowStatus =
  | "discovered"
  | "cloning"
  | "analyzing"
  | "proposed"
  | "branch_proposed"
  | "executing"
  | "pushing"
  | "done"
  | "rejected"
  | "failed";

export interface FollowEntry {
  id: number;
  host: string;
  projectId: number;
  issueIid: number;
  issueUrl: string;
  projectPath: string;
  title: string;
  status: FollowStatus;
  agentPrompt: string | null;
  agentResponse: string | null;
  userFeedback: string | null;
  branchName: string | null;
  worktreePath: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FollowRow {
  id: number;
  host: string;
  project_id: number;
  issue_iid: number;
  issue_url: string;
  project_path: string;
  title: string;
  status: FollowStatus;
  agent_prompt: string | null;
  agent_response: string | null;
  user_feedback: string | null;
  branch_name: string | null;
  worktree_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export class GitLabFollowStore {
  constructor(
    private readonly db: RuntimeDb,
    private readonly now: () => Date = () => new Date()
  ) {}

  ensureEntry(input: {
    host: string;
    projectId: number;
    issueIid: number;
    issueUrl: string;
    projectPath: string;
    title: string;
  }): FollowEntry {
    const nowIso = this.now().toISOString();
    this.db
      .prepare(
        `insert or ignore into gitlab_follow_entries
          (host, project_id, issue_iid, issue_url, project_path, title, status, created_at, updated_at)
         values (@host, @projectId, @issueIid, @issueUrl, @projectPath, @title, 'discovered', @now, @now)`
      )
      .run({
        host: input.host,
        projectId: input.projectId,
        issueIid: input.issueIid,
        issueUrl: input.issueUrl,
        projectPath: input.projectPath,
        title: input.title,
        now: nowIso
      });
    return this.get(input.host, input.projectId, input.issueIid)!;
  }

  get(host: string, projectId: number, issueIid: number): FollowEntry | undefined {
    const row = this.db
      .prepare(
        "select * from gitlab_follow_entries where host = ? and project_id = ? and issue_iid = ?"
      )
      .get(host, projectId, issueIid) as FollowRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  listActive(): FollowEntry[] {
    const rows = this.db
      .prepare(
        "select * from gitlab_follow_entries where status not in ('done', 'rejected') order by id asc"
      )
      .all() as FollowRow[];
    return rows.map(fromRow);
  }

  setStatus(entry: FollowEntry, status: FollowStatus, extra?: Record<string, unknown>): void {
    const nowIso = this.now().toISOString();
    const updates: string[] = ["status = @status", "updated_at = @now"];
    const params: Record<string, unknown> = {
      id: entry.id,
      status,
      now: nowIso
    };

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        const col = camelToSnake(key);
        updates.push(`${col} = @${key}`);
        params[key] = value;
      }
    }

    this.db
      .prepare(`update gitlab_follow_entries set ${updates.join(", ")} where id = @id`)
      .run(params);
  }
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function fromRow(row: FollowRow): FollowEntry {
  return {
    id: row.id,
    host: row.host,
    projectId: row.project_id,
    issueIid: row.issue_iid,
    issueUrl: row.issue_url,
    projectPath: row.project_path,
    title: row.title,
    status: row.status,
    agentPrompt: row.agent_prompt,
    agentResponse: row.agent_response,
    userFeedback: row.user_feedback,
    branchName: row.branch_name,
    worktreePath: row.worktree_path,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
