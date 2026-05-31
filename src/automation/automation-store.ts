import type { RuntimeDb } from "../app/runtime-db.js";
import type { AutomationDefinition, AutomationEffect, AutomationTrigger } from "./automation-models.js";

export class AutomationStore {
  constructor(private readonly db: RuntimeDb) {}

  create(input: {
    id: string;
    workspaceId: string;
    name: string;
    trigger: AutomationTrigger;
    conditionType: string;
    conditionValue: string;
    effect: AutomationEffect;
    now: string;
  }): AutomationDefinition {
    this.db
      .prepare(
        `insert into automations (id, workspace_id, name, trigger, condition_type, condition_value, effect, enabled, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .run(input.id, input.workspaceId, input.name, input.trigger, input.conditionType, input.conditionValue, input.effect, input.now, input.now);

    return { id: input.id, workspaceId: input.workspaceId, name: input.name, trigger: input.trigger, conditionType: input.conditionType as AutomationDefinition["conditionType"], conditionValue: input.conditionValue, effect: input.effect, enabled: true, createdAt: input.now, updatedAt: input.now };
  }

  listEnabled(workspaceId: string): AutomationDefinition[] {
    const rows = this.db
      .prepare("select id, workspace_id, name, trigger, condition_type, condition_value, effect, enabled, created_at, updated_at from automations where workspace_id = ? and enabled = 1")
      .all(workspaceId) as Array<{
        id: string; workspace_id: string; name: string; trigger: AutomationTrigger;
        condition_type: string; condition_value: string; effect: AutomationEffect;
        enabled: 0 | 1; created_at: string; updated_at: string;
      }>;

    return rows.map((r) => ({
      id: r.id, workspaceId: r.workspace_id, name: r.name, trigger: r.trigger,
      conditionType: r.condition_type as AutomationDefinition["conditionType"],
      conditionValue: r.condition_value, effect: r.effect,
      enabled: r.enabled === 1, createdAt: r.created_at, updatedAt: r.updated_at
    }));
  }
}
