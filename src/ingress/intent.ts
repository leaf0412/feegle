export const intentKinds = [
  "chat",
  "control_action",
  "slash_command",
  "workflow_signal",
  "scheduled_workflow",
  "diagnostic_request"
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
