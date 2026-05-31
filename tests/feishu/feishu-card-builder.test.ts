import { describe, expect, it } from "vitest";
import {
  buildRequirementStatusCard,
  buildWorkflowProgressCard,
  type FeishuInteractiveCard
} from "@integrations/feishu/feishu-card-builder.js";
import { parseFeishuCardActionValue } from "@integrations/feishu/feishu-gateway.js";

describe("buildRequirementStatusCard", () => {
  it("renders a shared card with per-repository push actions", () => {
    const card = buildRequirementStatusCard({
      title: "会员登录优化",
      requirementId: "req_1",
      status: "push_ready",
      repositories: [
        {
          id: "web",
          name: "web-app",
          branch: "yb/feat/member_login",
          pushStatus: "ready"
        },
        {
          id: "api",
          name: "api-service",
          branch: "yb/feat/member_login_api",
          pushStatus: "not_ready"
        }
      ],
      prototypeFileName: "prototype.zip",
      planSummary: "已确认开发计划，等待推送。"
    });

    expect(card.config.update_multi).toBe(true);
    expect(card.header.template).toBe("green");
    expect(card.header.title.content).toBe("会员登录优化 · 可推送");
    expect(flattenCardText(card)).toContain("prototype.zip");
    expect(flattenCardText(card)).toContain("web-app");
    expect(flattenCardText(card)).toContain("yb/feat/member_login");

    const actions = findButtons(card);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.text.content).toBe("推送 web-app");
    expect(parseFeishuCardActionValue(actions[0]?.value)).toEqual({
      type: "platform_action",
      action: {
        kind: "act",
        command: "/push",
        args: "repo web",
        raw: "act:/push repo web"
      },
      sessionKey: undefined
    });
  });

  it("renders prototype approval and cancel actions", () => {
    const card = buildRequirementStatusCard({
      title: "原型确认",
      requirementId: "req_3",
      status: "prototype_reviewing",
      repositories: []
    });

    const actions = findButtons(card);
    expect(actions.map((action) => action.text.content)).toEqual(["确认原型", "取消需求"]);
    expect(actions.map((action) => parseFeishuCardActionValue(action.value))).toEqual([
      {
        type: "platform_action",
        action: {
          kind: "act",
          command: "/prototype",
          args: "approve req_3",
          raw: "act:/prototype approve req_3"
        },
        sessionKey: undefined
      },
      {
        type: "platform_action",
        action: {
          kind: "act",
          command: "/requirement",
          args: "cancel req_3",
          raw: "act:/requirement cancel req_3"
        },
        sessionKey: undefined
      }
    ]);
  });

  it("renders plan confirmation and cancel actions", () => {
    const card = buildRequirementStatusCard({
      title: "计划确认",
      requirementId: "req_4",
      status: "plan_generated",
      repositories: []
    });

    const actions = findButtons(card);
    expect(actions.map((action) => action.text.content)).toEqual(["确认计划", "取消需求"]);
    expect(actions[0]?.value).toMatchObject({ action: "act:/plan confirm req_4" });
    expect(actions[1]?.value).toMatchObject({ action: "act:/requirement cancel req_4" });
  });

  it("does not render push buttons before repositories are ready", () => {
    const card = buildRequirementStatusCard({
      title: "新需求",
      requirementId: "req_2",
      status: "branch_suggested",
      repositories: [
        {
          id: "web",
          name: "web-app",
          branch: "yb/feat/new_requirement",
          pushStatus: "not_ready"
        }
      ]
    });

    expect(card.header.template).toBe("blue");
    expect(findButtons(card)).toHaveLength(0);
  });
});

describe("buildWorkflowProgressCard", () => {
  it("renders compact progress blocks with status color", () => {
    const card = buildWorkflowProgressCard({
      title: "Codex · Running",
      status: "running",
      steps: [
        { label: "生成离线原型", state: "done" },
        { label: "等待产品确认", state: "running", detail: "已发送 prototype.zip" },
        { label: "TDD 开发", state: "pending" }
      ],
      footer: "完成后会在原消息上更新卡片。"
    });

    expect(card.schema).toBe("2.0");
    expect(card.config.update_multi).toBe(true);
    expect(card.header.template).toBe("blue");
    expect(flattenCardText(card)).toContain("已完成 1/3");
    expect(flattenCardText(card)).toContain("等待产品确认");
    expect(flattenCardText(card)).toContain("已发送 prototype.zip");
  });
});

function flattenCardText(card: FeishuInteractiveCard): string {
  return JSON.stringify(card);
}

function findButtons(card: FeishuInteractiveCard): Array<{
  text: { content: string };
  value: unknown;
}> {
  const bodyElements = card.body?.elements ?? card.elements ?? [];
  return bodyElements.flatMap(findButtonsInElement);
}

function findButtonsInElement(element: unknown): Array<{ text: { content: string }; value: unknown }> {
  if (!isRecord(element)) {
    return [];
  }
  if (element.tag === "button" && isRecord(element.text) && "value" in element) {
    return [{ text: element.text as { content: string }, value: element.value }];
  }
  if (element.tag === "action" && Array.isArray(element.actions)) {
    return element.actions.flatMap(findButtonsInElement);
  }
  if (element.tag === "column_set" && Array.isArray(element.columns)) {
    return element.columns.flatMap((column) => {
      if (!isRecord(column) || !Array.isArray(column.elements)) {
        return [];
      }
      return column.elements.flatMap(findButtonsInElement);
    });
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
