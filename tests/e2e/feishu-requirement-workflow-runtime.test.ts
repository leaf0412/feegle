import { describe, expect, it } from "vitest";
import { createRuntimeClosedLoopHarness } from "./runtime-closed-loop-harness.js";
import { feishuMessageEnvelopeToTriggerEvent } from "@integrations/feishu/feishu-trigger-event-adapter.js";
import { requirementWorkflowRuntimeContribution } from "@plugins/requirement-workflow/requirement-workflow-runtime-contribution.js";
import { registerFeishuRequirementIntentResolvers } from "@plugins/feishu/feishu-requirement-intent-resolver.js";

describe("Feishu requirement workflow closed loop", () => {
  it("routes Feishu requirement intake through requirement workflow and render effect", async () => {
    const harness = await createRuntimeClosedLoopHarness();
    try {
      requirementWorkflowRuntimeContribution().register({
        workflows: harness.workflowRegistry,
        intentResolvers: harness.intentResolvers,
        workflowSelector: harness.workflowSelector,
        effectHandlers: harness.effectHandlerRegistry
      } as never);
      registerFeishuRequirementIntentResolvers(harness.intentResolvers);

      harness.effectHandlerRegistry.register({
        pluginId: "requirement-workflow",
        effectType: "plan.generate",
        async execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return {
            requirementId: "reqwf_e2e",
            planVersion: 1,
            markdown: "# Plan\n\n- Add workflow\n- Verify workflow"
          };
        }
      });

      harness.effectHandlerRegistry.register({
        pluginId: "feishu",
        effectType: "requirement.plan_review.render",
        async execute(effect) {
          harness.effectCalls.push({
            pluginId: effect.pluginId,
            effectType: effect.effectType,
            input: effect.input
          });
          return { rendered: true, messageId: "om_plan_card" };
        }
      });

      const trigger = feishuMessageEnvelopeToTriggerEvent({
        triggerEventId: "trg_requirement_msg",
        receivedAt: "2026-05-31T00:00:00.000Z",
        chatId: "oc_e2e",
        messageId: "om_e2e",
        senderUserId: "ou_e2e",
        commandType: "chat",
        raw: "需求文档：请实现计划生成、修订、执行和验收闭环",
        textLength: 28
      });

      const result = await harness.dispatcher.dispatch(trigger);
      const workflowInstanceId = `wfi_e2e_${harness.wfiCounter}`;

      expect(result.status).toBe("succeeded");
      expect(harness.runtimeEvents(workflowInstanceId)).toContain("attempt.completed");
      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({
          pluginId: "requirement-workflow",
          effectType: "plan.generate"
        })
      );
      expect(harness.effectCalls).toContainEqual(
        expect.objectContaining({
          pluginId: "feishu",
          effectType: "requirement.plan_review.render"
        })
      );
    } finally {
      await harness.close();
    }
  });
});
