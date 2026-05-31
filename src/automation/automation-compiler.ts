import type { AutomationDefinition } from "./automation-models.js";
import type { WorkflowDefinition } from "../core/runtime/runtime-models.js";

export function compileAutomation(def: AutomationDefinition): WorkflowDefinition {
  return {
    definitionId: `automation.${def.id}`,
    version: 1,
    concurrencyPolicy: "skip_if_running",
    steps: [
      {
        stepId: "execute_automation",
        run: async (ctx) => {
          const payload = { automationId: def.id, trigger: def.trigger, effect: def.effect };

          if (def.effect === "create_diagnostic" || def.effect === "trigger_recovery") {
            return { kind: "complete", output: { ...payload, executed: true } };
          }

          if (def.effect === "send_notification") {
            await ctx.executeEffect({
              pluginId: "core",
              effectType: "send_notification",
              input: { message: `Automation ${def.name} triggered` }
            });
            return { kind: "complete", output: { ...payload, notified: true } };
          }

          return { kind: "complete", output: payload };
        }
      }
    ]
  };
}
