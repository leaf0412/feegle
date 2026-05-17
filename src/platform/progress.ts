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
