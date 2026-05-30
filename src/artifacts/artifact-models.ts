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
    case "diagnostic_bundle":
    case "memory_candidate_batch":
      return 90;
    case "stderr_stdout":
    case "agent_transcript":
    case "uploaded_file":
      return 30;
    case "prompt":
    case "plugin_payload":
      return 14;
    case "diff_patch":
    case "test_report":
    case "plan_document":
      return 180;
  }
}
