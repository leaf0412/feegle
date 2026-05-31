import { describe, expect, it } from "vitest";
import { resolveFeishuRequirementIntent, isRequirementMessage, registerFeishuRequirementIntentResolvers, resolveFeishuRequirementCardActionIntent, isFeishuRequirementActionType } from "@plugins/feishu/feishu-requirement-intent-resolver.js";
import { IntentResolverRegistry } from "@core/ingress/intent-resolver-registry.js";

describe("resolveFeishuRequirementIntent", () => {
  it("maps a requirement document message to requirement_intake", () => {
    const intent = resolveFeishuRequirementIntent({
      triggerEventId: "evt_1",
      resolvedWorkspaceId: "workspace-default",
      resolvedProjectId: null,
      resolvedUserId: "user_1",
      sourcePlugin: "feishu",
      commandType: "chat",
      chatId: "oc_1",
      messageId: "om_1",
      conversationKey: "feishu:oc_1",
      text: "需求文档：请实现计划生成、修订、执行和验收闭环"
    });
    expect(intent).toMatchObject({
      kind: "requirement_intake",
      workspaceId: "workspace-default",
      actor: { kind: "user", userId: "user_1" },
      payload: { sourcePlugin: "feishu", requirementText: "需求文档：请实现计划生成、修订、执行和验收闭环" }
    });
  });

  it("maps to requirement_plan_revise when a known requirementId is present", () => {
    const intent = resolveFeishuRequirementIntent({
      triggerEventId: "evt_2", resolvedWorkspaceId: "ws", resolvedProjectId: null, resolvedUserId: "u",
      sourcePlugin: "feishu", commandType: "chat", chatId: "oc", messageId: "om", conversationKey: "feishu:oc",
      text: "加上测试计划", requirementId: "reqwf_1"
    });
    expect(intent.kind).toBe("requirement_plan_revise");
    expect(intent.payload).toMatchObject({ requirementId: "reqwf_1", feedback: "加上测试计划" });
  });

  it("isRequirementMessage detects prefixes and doc urls, rejects plain chat", () => {
    expect(isRequirementMessage("需求文档：做个登录页")).toBe(true);
    expect(isRequirementMessage("需求: 做个登录页")).toBe(true);
    expect(isRequirementMessage("https://xxx.feishu.cn/docx/abc")).toBe(true);
    expect(isRequirementMessage("今天天气不错")).toBe(false);
  });
});

describe("resolveFeishuRequirementCardActionIntent", () => {
  function base() {
    return {
      triggerEventId: "evt_2",
      resolvedWorkspaceId: "workspace-default",
      resolvedProjectId: null as string | null,
      resolvedUserId: "user_1",
      sourcePlugin: "feishu",
      chatId: "oc_1",
      messageId: "om_1"
    };
  }

  it("maps approve action to requirement_plan_approve", () => {
    const intent = resolveFeishuRequirementCardActionIntent({
      ...base(),
      actionType: "requirement_plan_approve",
      actionPayload: { requirementId: "reqwf_1", planVersion: 2 }
    });
    expect(intent?.kind).toBe("requirement_plan_approve");
    expect(intent?.payload).toMatchObject({ sourcePlugin: "feishu", requirementId: "reqwf_1", planVersion: 2 });
  });

  it("maps each requirement action type 1:1", () => {
    for (const a of ["requirement_plan_approve", "requirement_plan_revise", "requirement_execute", "requirement_verify", "requirement_accept", "requirement_cancel"]) {
      const intent = resolveFeishuRequirementCardActionIntent({ ...base(), actionType: a, actionPayload: { requirementId: "reqwf_1" } });
      expect(intent?.kind).toBe(a);
      expect(intent?.payload).toMatchObject({ sourcePlugin: "feishu", requirementId: "reqwf_1" });
    }
  });

  it("returns undefined for an unknown / non-requirement action", () => {
    expect(resolveFeishuRequirementCardActionIntent({ ...base(), actionType: "workbench_plan_approve", actionPayload: {} })).toBeUndefined();
    expect(resolveFeishuRequirementCardActionIntent({ ...base(), actionType: "something_else", actionPayload: {} })).toBeUndefined();
  });

  it("isFeishuRequirementActionType accepts requirement_* actions and rejects others", () => {
    expect(isFeishuRequirementActionType("requirement_plan_approve")).toBe(true);
    expect(isFeishuRequirementActionType("requirement_cancel")).toBe(true);
    expect(isFeishuRequirementActionType("workbench_plan_approve")).toBe(false);
    expect(isFeishuRequirementActionType("nope")).toBe(false);
  });
});

describe("feishu requirement card-action resolver registration", () => {
  function cardActionEvent(actionType: string, actionPayload: Record<string, unknown> = {}) {
    return {
      triggerEventId: "evt_card_1",
      source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "card_action" },
      receivedAt: "t",
      external: {
        chatId: "oc_1",
        messageId: "om_1",
        actionType,
        actionPayload,
        resolvedWorkspaceId: "ws",
        resolvedProjectId: null,
        resolvedUserId: "u"
      },
      actorHint: { provider: "feishu", externalUserId: "u" },
      payloadSummary: { actionType }
    };
  }

  it("claims requirement card actions and produces the right intent kind", async () => {
    const reg = new IntentResolverRegistry();
    registerFeishuRequirementIntentResolvers(reg);
    const intent = await reg.resolve(cardActionEvent("requirement_plan_approve", { requirementId: "reqwf_1", planVersion: 2 }) as never);
    expect(intent.kind).toBe("requirement_plan_approve");
    expect(intent.payload).toMatchObject({ sourcePlugin: "feishu", requirementId: "reqwf_1", planVersion: 2 });
  });

  it("does NOT claim an unknown card action type", async () => {
    const reg = new IntentResolverRegistry();
    registerFeishuRequirementIntentResolvers(reg);
    await expect(reg.resolve(cardActionEvent("workbench_plan_approve") as never)).rejects.toThrow();
  });
});

describe("feishu requirement resolver registration", () => {
  function evt(raw: string) {
    return { triggerEventId: "e", source: { pluginId: "feishu", adapterId: "long_connection", triggerType: "message" },
      receivedAt: "t", external: { chatId: "oc_1", messageId: "om_1", commandType: "chat", raw, resolvedWorkspaceId: "ws", resolvedProjectId: null, resolvedUserId: "u" }, payloadSummary: {} };
  }
  it("claims requirement messages and produces requirement_intake", async () => {
    const reg = new IntentResolverRegistry();
    registerFeishuRequirementIntentResolvers(reg);
    const intent = await reg.resolve(evt("需求文档：做个X") as never);
    expect(intent.kind).toBe("requirement_intake");
  });
  it("does NOT claim a plain chat message", async () => {
    const reg = new IntentResolverRegistry();
    registerFeishuRequirementIntentResolvers(reg);
    // canResolve must be false for plain chat -> resolve throws "No intent resolver"
    await expect(reg.resolve(evt("今天天气不错") as never)).rejects.toThrow();
  });
});
