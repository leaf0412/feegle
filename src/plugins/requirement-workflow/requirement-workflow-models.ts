export const requirementWorkflowStatuses = [
  "intake_received",
  "planning",
  "plan_reviewing",
  "plan_approved",
  "executing",
  "implementation_ready",
  "verifying",
  "accepted",
  "cancelled",
  "failed"
] as const;

export type RequirementWorkflowStatus = (typeof requirementWorkflowStatuses)[number];

export function isRequirementWorkflowStatus(value: unknown): value is RequirementWorkflowStatus {
  return typeof value === "string" && requirementWorkflowStatuses.includes(value as RequirementWorkflowStatus);
}

export interface RequirementIntakePayload {
  sourcePlugin: string;
  workspaceId: string;
  projectId: string | null;
  conversationKey: string;
  requesterUserId: string;
  requirementText: string;
  sourceRef?: {
    chatId?: string;
    messageId?: string;
    documentUrl?: string;
  };
}

export interface RequirementWorkflowRecord {
  requirementId: string;
  workspaceId: string;
  projectId: string | null;
  conversationKey: string;
  requesterUserId: string;
  status: RequirementWorkflowStatus;
  title: string;
  requirementText: string;
  currentPlanVersion: number;
  createdAt: string;
  updatedAt: string;
}
