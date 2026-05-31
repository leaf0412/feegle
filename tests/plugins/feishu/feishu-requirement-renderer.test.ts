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

function makeClient() {
  return {
    sendInteractiveCard: vi.fn().mockResolvedValue("om_new"),
    updateInteractiveCard: vi.fn().mockResolvedValue(undefined)
  };
}

describe("Feishu requirement render effects", () => {
  it("updates the clicked card in place when cardMessageId is present (single evolving card)", async () => {
    const { handlers, registry } = makeRegistry();
    const client = makeClient();
    registerFeishuRequirementRenderEffects(registry as never, client as never, makeCloudDoc() as never);

    const out = await handlers["feishu:requirement.execution_progress.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", cardMessageId: "om_card", result: { status: "done" } }
    });

    // an in-place update must NOT post a new message — that is what let users
    // re-click the stale card and re-trigger the action.
    expect(client.updateInteractiveCard).toHaveBeenCalledWith("om_card", expect.objectContaining({ schema: "2.0" }));
    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
    expect(out).toEqual({ rendered: true, messageId: "om_card" });
  });

  it("sends a fresh card when cardMessageId is absent (first render from text intake)", async () => {
    const { handlers, registry } = makeRegistry();
    const client = makeClient();
    registerFeishuRequirementRenderEffects(registry as never, client as never, makeCloudDoc() as never);

    await handlers["feishu:requirement.plan_review.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", planVersion: 1, markdown: "# Plan" }
    });

    expect(client.sendInteractiveCard).toHaveBeenCalledTimes(1);
    expect(client.updateInteractiveCard).not.toHaveBeenCalled();
  });

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
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("https://feishu.cn/docx/doc_1");
    expect(cardJson).toContain("act:/requirement plan approve");
    expect(cardJson).toContain("act:/requirement plan cancel");
    expect(cardJson).toContain("act:/requirement plan revise submit");
    expect(cardJson).toContain('"requirement_id":"reqwf_1"');

    expect(output).toEqual({ rendered: true, messageId: "om_card", documentId: "doc_1", docUrl: "https://feishu.cn/docx/doc_1" });
  });

  it("registers the four requirement render effects (plan_approved folded into development)", () => {
    const { handlers, registry } = makeRegistry();
    const client = makeClient();
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

  it("development card (developing phase) is locked — no buttons while the agent runs", async () => {
    const { handlers, registry } = makeRegistry();
    const client = makeClient();
    registerFeishuRequirementRenderEffects(registry as never, client as never, makeCloudDoc() as never);

    await handlers["feishu:requirement.execution_progress.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", cardMessageId: "om_card", phase: "developing" }
    });

    const [, card] = (client.updateInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("开发中");
    expect(cardJson).not.toContain('"action_type":"form_submit"'); // locked: nothing to re-click
  });

  it("development card (completed phase) offers 结束 (verify) and 取消, not a 执行开发 button", async () => {
    const { handlers, registry } = makeRegistry();
    const client = makeClient();
    registerFeishuRequirementRenderEffects(registry as never, client as never, makeCloudDoc() as never);

    await handlers["feishu:requirement.execution_progress.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", cardMessageId: "om_card", phase: "completed", result: { status: "implementation_ready" } }
    });

    const [, card] = (client.updateInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("开发完成");
    expect(cardJson).toContain("结束");
    expect(cardJson).toContain("act:/requirement verify");
    expect(cardJson).toContain("取消");
    expect(cardJson).toContain("act:/requirement plan cancel");
    expect(cardJson).not.toContain("act:/requirement execute");
  });

  it("development card (failed phase) shows the error and only a 取消 button", async () => {
    const { handlers, registry } = makeRegistry();
    const client = makeClient();
    registerFeishuRequirementRenderEffects(registry as never, client as never, makeCloudDoc() as never);

    await handlers["feishu:requirement.execution_progress.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", cardMessageId: "om_card", phase: "failed", error: "no git repo" }
    });

    const [, card] = (client.updateInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("开发失败");
    expect(cardJson).toContain("no git repo");
    expect(cardJson).toContain("act:/requirement plan cancel");
    expect(cardJson).not.toContain("act:/requirement verify");
  });

  it("development render throws when chatId is missing", async () => {
    const { handlers, registry } = makeRegistry();
    const client = makeClient();
    registerFeishuRequirementRenderEffects(registry as never, client as never, makeCloudDoc() as never);

    await expect(handlers["feishu:requirement.execution_progress.render"].execute({
      input: { requirementId: "reqwf_1", phase: "developing" }
    })).rejects.toThrow("Missing required field: chatId");

    expect(client.sendInteractiveCard).not.toHaveBeenCalled();
    expect(client.updateInteractiveCard).not.toHaveBeenCalled();
  });

  it("verification_result card contains 验收 button when result.status is passed", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om_verify") };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    await handlers["feishu:requirement.verification_result.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", result: { status: "passed" }, report: "All tests pass." }
    });

    const [, card] = (client.sendInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    const cardJson = JSON.stringify(card);
    expect(cardJson).toContain("act:/requirement accept");
    expect(cardJson).toContain('"requirement_id":"reqwf_1"');
    expect(cardJson).toContain("验收");
  });

  it("verification_result card has NO 验收 button when result.status is failed", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om_fail") };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    await handlers["feishu:requirement.verification_result.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", result: { status: "failed" }, report: "Tests failed." }
    });

    const [, card] = (client.sendInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    const cardJson = JSON.stringify(card);
    // The accept action must not appear — the title contains "验收结果" but there must be no action button
    expect(cardJson).not.toContain("act:/requirement accept");
    expect(cardJson).not.toContain('"tag":"action"');
    expect(cardJson).not.toContain('"tag":"button"');
  });

  it("acceptance_result card has no action button", async () => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om_accept") };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    await handlers["feishu:requirement.acceptance_result.render"].execute({
      input: { chatId: "oc_1", requirementId: "reqwf_1", report: "Accepted." }
    });

    const [, card] = (client.sendInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    const cardJson = JSON.stringify(card);
    expect(cardJson).not.toContain('"tag":"action"');
    expect(cardJson).not.toContain('"tag":"button"');
    expect(cardJson).toContain("🎉 需求已验收");
  });

  // Regression: Feishu card schema 2.0 rejects the standalone `tag:"action"`
  // block (ErrCode 200861 "unsupported tag action"), which silently kills the
  // whole card send. Every interactive button must therefore be a form_submit
  // button inside a form. These assertions fail if anyone reintroduces tag:action.
  it.each([
    {
      name: "plan_review",
      effect: "feishu:requirement.plan_review.render",
      input: { chatId: "oc_1", requirementId: "reqwf_1", planVersion: 1, markdown: "# Plan", summary: "X" }
    },
    {
      name: "development (completed)",
      effect: "feishu:requirement.execution_progress.render",
      input: { chatId: "oc_1", requirementId: "reqwf_1", phase: "completed", result: { status: "done" } }
    },
    {
      name: "verification_result (passed)",
      effect: "feishu:requirement.verification_result.render",
      input: { chatId: "oc_1", requirementId: "reqwf_1", result: { status: "passed" }, report: "ok" }
    }
  ])("$name card uses schema-2.0 form_submit buttons, never tag:action", async ({ effect, input }) => {
    const { handlers, registry } = makeRegistry();
    const client = { sendInteractiveCard: vi.fn().mockResolvedValue("om") };
    const cloudDoc = makeCloudDoc();
    registerFeishuRequirementRenderEffects(registry as never, client as never, cloudDoc as never);

    await handlers[effect].execute({ input });

    const [, card] = (client.sendInteractiveCard as ReturnType<typeof vi.fn>).mock.calls[0] as [string, unknown];
    const cardJson = JSON.stringify(card);
    expect(cardJson).not.toContain('"tag":"action"');
    expect(cardJson).toContain('"action_type":"form_submit"');
    expect(cardJson).toContain('"tag":"form"');
  });
});
