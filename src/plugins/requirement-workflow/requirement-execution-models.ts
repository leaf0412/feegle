export type RequirementExecutionStatus =
  | "pending_approval"
  | "approved"
  | "executing"
  | "implementation_ready"
  | "failed"
  | "cancelled";

export interface RequirementExecutionRecord {
  requirementId: string;
  planVersion: number;
  requestedByUserId: string;
  status: RequirementExecutionStatus;
  approvedByUserId?: string;
  worktreePath?: string;
  headBranch?: string;
  summary?: string;
  diffStats?: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  createdAt: string;
  updatedAt: string;
}
