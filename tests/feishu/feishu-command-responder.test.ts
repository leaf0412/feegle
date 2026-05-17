import { describe, expect, it } from "vitest";
import { FeishuCommandResponder } from "../../src/feishu/feishu-command-responder.js";
import type { AgentCli } from "../../src/agent/agent-cli.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";

describe("FeishuCommandResponder", () => {
  it("replies with selected repositories", async () => {
    const replies: Array<{ chatId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies));

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_1",
      command: { type: "repo_select", repositoryIds: ["web", "api"] }
    });

    expect(replies).toEqual([
      {
        chatId: "oc_1",
        text: "已收到仓库选择：web、api。\n下一步我会基于这些仓库建议需求分支名称。"
      }
    ]);
  });

  it("replies to push card actions", async () => {
    const replies: Array<{ chatId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies));

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_2",
      command: { type: "push_repository", requirementId: "req_1", repositoryId: "web" }
    });

    expect(replies).toEqual([
      {
        chatId: "oc_1",
        text: "已收到推送请求：需求 req_1，仓库 web。\n当前入口还没有接入 git push 执行器。"
      }
    ]);
  });

  it("replies with help text for unknown commands", async () => {
    const replies: Array<{ chatId: string; text: string }> = [];
    const agentCalls: unknown[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      fakeAgent(agentCalls, "Codex 计划：先绑定仓库，再创建分支。")
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_3",
      command: { type: "unknown", raw: "hello" }
    });

    expect(replies).toEqual([
      {
        chatId: "oc_1",
        text: "收到需求，正在交给 Codex 分析..."
      },
      {
        chatId: "oc_1",
        text: "Codex 计划：先绑定仓库，再创建分支。"
      }
    ]);
    expect(agentCalls).toEqual([
      {
        requirementId: "om_3",
        title: "hello",
        requirementText: "hello"
      }
    ]);
  });
});

function fakeClient(replies: Array<{ chatId: string; text: string }>): FeishuClientPort {
  return {
    async sendText(chatId, text) {
      replies.push({ chatId, text });
      return "om_reply";
    },
    async sendInteractiveCard() {
      return "om_card";
    },
    async updateInteractiveCard() {}
  };
}

function fakeAgent(calls: unknown[], plan: string): AgentCli {
  return {
    async generatePrototype() {
      throw new Error("generatePrototype should not be called");
    },
    async generatePlan(context) {
      calls.push(context);
      return plan;
    },
    async runDevelopmentTask() {
      throw new Error("runDevelopmentTask should not be called");
    }
  };
}
