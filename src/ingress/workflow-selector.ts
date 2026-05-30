import type { Intent } from "./intent.js";

export interface WorkflowSelectionRule {
  id: string;
  matches(intent: Intent): boolean;
  definitionId: string;
}

export class WorkflowSelector {
  private readonly rules: WorkflowSelectionRule[] = [];

  register(rule: WorkflowSelectionRule): void {
    if (this.rules.some((item) => item.id === rule.id)) {
      throw new Error(`Workflow selection rule already registered: ${rule.id}`);
    }
    this.rules.push(rule);
  }

  select(intent: Intent): { definitionId: string } {
    const rule = this.rules.find((item) => item.matches(intent));
    if (!rule) {
      throw new Error(`No workflow selected for intent: ${intent.kind}`);
    }
    return { definitionId: rule.definitionId };
  }
}
