export const MEMORY_SCOPES = [
  "system",
  "workspace",
  "project",
  "conversation",
  "session",
  "user",
  "run"
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export function isMemoryScope(value: unknown): value is MemoryScope {
  return typeof value === "string" && (MEMORY_SCOPES as readonly string[]).includes(value);
}

export const DEFAULT_MEMORY_SCOPE: MemoryScope = "conversation";

/**
 * Cross-scope visibility rules (spec).
 * When searching at a given scope, records at that scope AND narrower
 * scopes are visible.  Scope hierarchy (narrowest → broadest):
 *   run < session < conversation < project < workspace < system
 *
 *   project   → project + conversation + session + run
 *   workspace → workspace + project
 *   system    → all scopes
 */
export const SCOPE_HIERARCHY: Record<MemoryScope, MemoryScope[]> = {
  run: ["run"],
  session: ["session", "run"],
  conversation: ["conversation", "session", "run"],
  project: ["project", "conversation", "session", "run"],
  workspace: ["workspace", "project"],
  user: ["user"],
  system: [...MEMORY_SCOPES]
};

export const MEMORY_KINDS = [
  "preference",
  "fact",
  "decision",
  "procedure",
  "failure_pattern",
  "summary",
  "domain_term",
  "constraint"
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && (MEMORY_KINDS as readonly string[]).includes(value);
}

export const MEMORY_STATUSES = [
  "pending_approval",
  "active",
  "rejected",
  "revoked",
  "expired"
] as const;

export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export function isMemoryStatus(value: unknown): value is MemoryStatus {
  return typeof value === "string" && (MEMORY_STATUSES as readonly string[]).includes(value);
}

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

export interface MemoryHistoryEntry {
  id: string;
  memoryId: string;
  fromStatus: MemoryStatus | null;
  toStatus: MemoryStatus;
  actor: string | null;
  createdAt: string;
}
