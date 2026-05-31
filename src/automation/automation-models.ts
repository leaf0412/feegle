export const automationTriggers = ["on_workflow_failed", "on_schedule", "on_memory_candidate"] as const;
export type AutomationTrigger = (typeof automationTriggers)[number];

export const automationConditions = ["matches_kind", "always"] as const;
export type AutomationCondition = (typeof automationConditions)[number];

export const automationEffects = ["trigger_recovery", "create_diagnostic", "send_notification"] as const;
export type AutomationEffect = (typeof automationEffects)[number];

export interface AutomationDefinition {
  id: string;
  workspaceId: string;
  name: string;
  trigger: AutomationTrigger;
  conditionType: AutomationCondition;
  conditionValue: string;
  effect: AutomationEffect;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
