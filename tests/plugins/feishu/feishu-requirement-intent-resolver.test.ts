import { describe, expect, it } from "vitest";
import { resolveFeishuRequirementIntent, isRequirementMessage, registerFeishuRequirementIntentResolvers } from "@plugins/feishu/feishu-requirement-intent-resolver.js";
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
  it("does NOT claim a plain chat message", () => {
    const reg = new IntentResolverRegistry();
    registerFeishuRequirementIntentResolvers(reg);
    expect(() => { /* no resolver should match */ return (reg as never as { resolve: (e: unknown) => unknown }); }).toBeDefined();
    // canResolve must be false for plain chat -> resolve throws "No intent resolver"
    return expect(reg.resolve(evt("今天天气不错") as never)).rejects.toThrow();
  });
});
