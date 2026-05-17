import { describe, expect, it } from "vitest";
import { FeishuCommandResponder } from "../../src/feishu/feishu-command-responder.js";
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
    const responder = new FeishuCommandResponder(fakeClient(replies));

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_3",
      command: { type: "unknown", raw: "hello" }
    });

    expect(replies).toEqual([
      {
        chatId: "oc_1",
        text: "我收到了消息，但还不认识这个指令：hello\n当前支持：/repo select <仓库ID1> <仓库ID2>"
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
