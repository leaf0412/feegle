export const intentKinds = [
  "chat",
  "control_action",
  "slash_command",
  "workflow_signal",
  "scheduled_workflow",
  "diagnostic_request",
  "requirement_plan_generate",
  "requirement_plan_revise",
  "requirement_plan_approve",
  "requirement_execute",
  "requirement_verify",
  "requirement_accept",
  "requirement_intake",
  "requirement_cancel"
] as const;

export type IntentKind = (typeof intentKinds)[number];

export type IntentActor =
  | { kind: "system" }
  | { kind: "scheduler" }
  | { kind: "agent"; runAttemptId: string }
  | { kind: "user"; userId: string };

export interface Intent {
  intentId: string;
  kind: IntentKind;
  workspaceId: string;
  projectId: string | null;
  actor: IntentActor;
  payload: unknown;
}
