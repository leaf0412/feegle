export type PlatformProgressStatus = "queued" | "running" | "blocked" | "succeeded" | "failed";

export interface PlatformProgressInput {
  runId: string;
  title: string;
  status: PlatformProgressStatus;
  message?: string;
  completedSteps?: number;
  totalSteps?: number;
}

export interface PlatformProgressEvent extends PlatformProgressInput {
  kind: "progress";
  percent?: number;
}

export type PlatformProgressSnapshotState = "running" | "completed" | "failed";

export interface PlatformProgressSnapshot {
  title: string;
  state: PlatformProgressSnapshotState;
  truncated: boolean;
  entries: PlatformProgressEntry[];
  streaming?: boolean;
  elapsedMs?: number;
}

export type PlatformProgressToolStatus = "running" | "ok" | "failed";

export interface PlatformProgressToolStep {
  kind: "tool_step";
  name: string;
  summary?: string;
  status?: PlatformProgressToolStatus;
  exitCode?: number;
  input?: string;
  result?: string;
  elapsedMs?: number;
}

export type PlatformProgressEntry =
  | { kind: "thinking"; text: string }
  | { kind: "tool_use"; tool?: string; text: string }
  | { kind: "tool_result"; tool?: string; text: string }
  | { kind: "error"; text: string }
  | { kind: "info"; text: string }
  | PlatformProgressToolStep;

export function createProgressEvent(input: PlatformProgressInput): PlatformProgressEvent {
  return {
    kind: "progress",
    ...input,
    percent: calculatePercent(input.completedSteps, input.totalSteps)
  };
}

function calculatePercent(completedSteps?: number, totalSteps?: number): number | undefined {
  if (completedSteps === undefined || totalSteps === undefined) {
    return undefined;
  }

  if (totalSteps <= 0) {
    return undefined;
  }

  const boundedCompletedSteps = Math.min(Math.max(completedSteps, 0), totalSteps);
  return Math.round((boundedCompletedSteps / totalSteps) * 100);
}
