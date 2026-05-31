export type ArtifactKind =
  | "diagnostic_bundle"
  | "stderr_stdout"
  | "agent_transcript"
  | "prompt"
  | "plugin_payload"
  | "diff_patch"
  | "test_report"
  | "plan_document"
  | "uploaded_file"
  | "memory_candidate_batch";

export interface ArtifactRecord {
  id: string;
  workspaceId: string;
  workflowInstanceId: string | null;
  runAttemptId: string | null;
  kind: ArtifactKind;
  filePath: string;
  contentType: string;
  summary: Record<string, unknown>;
  retentionDays: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export function defaultRetentionDays(kind: ArtifactKind): number {
  switch (kind) {
    // plan: 365 days
    case "plan_document":
      return 365;
    // report: 180 days
    case "diff_patch":
    case "test_report":
      return 180;
    // log: 30 days
    case "stderr_stdout":
    case "agent_transcript":
      return 30;
    // diagnostic: 90 days
    case "diagnostic_bundle":
      return 90;
    // default: 90 days
    case "prompt":
    case "plugin_payload":
    case "uploaded_file":
    case "memory_candidate_batch":
    default:
      return 90;
  }
}
