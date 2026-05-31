import { describe, expect, it, vi } from "vitest";
import { registerFeishuRequirementRenderEffects } from "@plugins/feishu/feishu-requirement-renderer.js";

function makeRegistry() {
  const handlers: Record<string, { execute(effect: { input: unknown }): Promise<unknown> }> = {};
  const registry = {
    register: (handler: { pluginId: string; effectType: string; execute(effect: { input: unknown }): Promise<unknown> }) => {
      handlers[`${handler.pluginId}:${handler.effectType}`] = handler;
    }
  };
  return { handlers, registry };
}

describe("Feishu requirement render effects", () => {
  it("renders plan review card through Feishu client", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om_card") };
    registerFeishuRequirementRenderEffects(registry as never, client as never);
    const output = await handlers["feishu:requirement.plan_review.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", planVersion: 1, markdown: "# Plan" }
    });
    expect(client.sendInteractiveCard).toHaveBeenCalledWith("oc_1", expect.any(Object));
    expect(output).toEqual({ rendered: true, messageId: "om_card" });
  });

  it("registers all four requirement render effects", () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om") };
    registerFeishuRequirementRenderEffects(registry as never, client as never);
    expect(Object.keys(handlers).sort()).toEqual([
      "feishu:requirement.acceptance_result.render",
      "feishu:requirement.execution_progress.render",
      "feishu:requirement.plan_review.render",
      "feishu:requirement.verification_result.render"
    ]);
  });

  it("throws when chatId is missing", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn() };
    registerFeishuRequirementRenderEffects(registry as never, client as never);
    await expect(handlers["feishu:requirement.plan_review.render"].execute({
      input: { requirementId: "reqwf_1", planVersion: 1, markdown: "# Plan" }
    })).rejects.toThrow("Missing required field: chatId");
    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
  });

  it("throws when requirementId is missing", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn() };
    registerFeishuRequirementRenderEffects(registry as never, client as never);
    await expect(handlers["feishu:requirement.verification_result.render"].execute({
      input: { chatId: "oc_1" }
    })).rejects.toThrow("Missing required field: requirementId");
    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
  });

  it("execution_progress render returns rendered + messageId", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om_x") };
    registerFeishuRequirementRenderEffects(registry as never, client as never);
    const out = await handlers["feishu:requirement.execution_progress.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", result: { status: "implementation_ready" } }
    });
    expect(out).toEqual({ rendered: true, messageId: "om_x" });
  });
});
