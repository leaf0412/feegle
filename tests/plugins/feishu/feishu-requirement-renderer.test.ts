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

function makeCloudDoc() {
  return {
    createDoc: vi.fn().mockResolvedValue({ documentId: "doc_1" }),
    writeMarkdown: vi.fn().mockResolvedValue(undefined),
    buildDocUrl: vi.fn().mockReturnValue("https://feishu.cn/docx/doc_1"),
    deleteDoc: vi.fn().mockResolvedValue(undefined)
  };
}

describe("Feishu requirement render effects", () => {
  it("renders plan review by publishing a cloud doc and linking to it", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om_card") };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    const output = await handlers["feishu:requirement.plan_review.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", planVersion: 1, markdown: "# Plan", summary: "Implement X" }
    });

    expect(cloudDoc.createDoc).toHaveBeenCalledWith({ title: "需求计划 reqwf_1 v1" });
    expect(cloudDoc.writeMarkdown).toHaveBeenCalledWith({ documentId: "doc_1", markdown: "# Plan" });
    expect(cloudDoc.buildDocUrl).toHaveBeenCalledWith("doc_1");

    expect(client.sendInteractiveCard).toHaveBeenCalledWith("oc_1", expect.objectContaining({
      schema: "2.0"
    }));
    const [, card] = (client.sendInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    expect(JSON.stringify(card)).toContain("https://feishu.cn/docx/doc_1");

    expect(output).toEqual({ rendered: true, messageId: "om_card", documentId: "doc_1", docUrl: "https://feishu.cn/docx/doc_1" });
  });

  it("registers all four requirement render effects", () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om") };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);
    expect(Object.keys(handlers).sort()).toEqual([
      "feishu:requirement.acceptance_result.render",
      "feishu:requirement.execution_progress.render",
      "feishu:requirement.plan_review.render",
      "feishu:requirement.verification_result.render"
    ]);
  });

  it("throws when chatId is missing (before creating cloud doc)", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn() };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    await expect(handlers["feishu:requirement.plan_review.render"].execute({
      input: { requirementId: "reqwf_1", planVersion: 1, markdown: "# Plan" }
    })).rejects.toThrow("Missing required field: chatId");

    expect(cloudDoc.createDoc).not.toHaveBeenCalled();
    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
  });

  it("throws when requirementId is missing (before creating cloud doc)", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn() };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    await expect(handlers["feishu:requirement.plan_review.render"].execute({
      input: { chatId: "oc_1" }
    })).rejects.toThrow("Missing required field: requirementId");

    expect(cloudDoc.createDoc).not.toHaveBeenCalled();
    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
  });

  it("throws when requirementId is missing on verification_result render", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn() };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    await expect(handlers["feishu:requirement.verification_result.render"].execute({
      input: { chatId: "oc_1" }
    })).rejects.toThrow("Missing required field: requirementId");

    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
  });

  it("execution_progress render returns rendered + messageId (no cloud doc)", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om_x") };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    const out = await handlers["feishu:requirement.execution_progress.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", result: { status: "implementation_ready" } }
    });

    expect(cloudDoc.createDoc).not.toHaveBeenCalled();
    expect(out).toEqual({ rendered: true, messageId: "om_x" });
  });
});
