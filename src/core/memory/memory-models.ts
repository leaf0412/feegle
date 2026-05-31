export type MemoryScope =
  | "system"
  | "workspace"
  | "project"
  | "conversation"
  | "session"
  | "user"
  | "run";

export type MemoryKind =
  | "preference"
  | "fact"
  | "decision"
  | "procedure"
  | "failure_pattern"
  | "summary"
  | "domain_term"
  | "constraint";

export type MemoryStatus = "pending_approval" | "active" | "rejected";

export interface MemoryRecord {
  id: string;
  workspaceId: string;
  projectId: string | null;
  scope: MemoryScope;
  kind: MemoryKind;
  status: MemoryStatus;
  content: string;
  source: Record<string, unknown>;
  confidence: number;
  visibility: "workspace" | "project" | "private";
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
