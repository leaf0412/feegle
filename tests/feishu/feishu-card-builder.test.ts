import { describe, expect, it } from "vitest";
import {
  buildRequirementStatusCard,
  buildWorkflowProgressCard,
  type FeishuInteractiveCard
} from "../../src/feishu/feishu-card-builder.js";
import { parseFeishuCardActionValue } from "../../src/feishu/feishu-gateway.js";

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
      type: "push_repository",
      requirementId: "req_1",
      repositoryId: "web"
    });
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
  return bodyElements.flatMap((element) => {
    if (element.tag !== "action") {
      return [];
    }
    return element.actions.filter((action) => action.tag === "button");
  });
}
