import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FeishuCommandResponder } from "../../src/feishu/feishu-command-responder.js";
import type { AgentCli } from "../../src/agent/agent-cli.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";

describe("FeishuCommandResponder", () => {
  it("replies with selected repositories", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies));

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_1",
      command: { type: "repo_select", repositoryIds: ["web", "api"] }
    });

    expect(replies).toEqual([
      {
        messageId: "om_1",
        text: "已收到仓库选择：web、api。\n下一步我会基于这些仓库建议需求分支名称。"
      }
    ]);
  });

  it("replies to push card actions", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies));

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_2",
      command: { type: "push_repository", requirementId: "req_1", repositoryId: "web" }
    });

    expect(replies).toEqual([
      {
        messageId: "om_2",
        text: "已收到推送请求：需求 req_1，仓库 web。\n当前入口还没有接入 git push 执行器。"
      }
    ]);
  });

  it("surfaces platform actions until the action router is connected", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies));

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_2",
      command: {
        type: "platform_action",
        action: { kind: "act", command: "/push", args: "repo web", raw: "act:/push repo web" },
        sessionKey: "feishu:oc_1:channel"
      }
    });

    expect(replies).toEqual([
      {
        messageId: "om_2",
        text: "已收到卡片动作：act:/push repo web。\n当前入口还没有接入动作路由器。"
      }
    ]);
  });

  it("replies with help text for unknown commands", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const agentCalls: unknown[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies, [], progress),
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
        messageId: "om_3",
        text: "Codex 计划：先绑定仓库，再创建分支。"
      }
    ]);
    expect(JSON.stringify(progress)).toContain("Codex · 进行中");
    expect(JSON.stringify(progress)).toContain("\"state\":\"completed\"");
    expect(JSON.stringify(progress)).toContain("工具结果");
    expect(agentCalls).toEqual([
      {
        requirementId: "om_3",
        title: "hello",
        requirementText: "hello"
      }
    ]);
  });

  it("reports agent failures back to Feishu instead of throwing", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), failingAgent("codex exec failed"));

    await expect(
      responder.handleCommand({
        source: "message",
        chatId: "oc_1",
        messageId: "om_4",
        command: { type: "unknown", raw: "做一个登录失败重试需求" }
      })
    ).resolves.toBeUndefined();

    expect(replies).toEqual([
      {
        messageId: "om_4",
        text: "Codex 分析失败：codex exec failed"
      }
    ]);
    expect(JSON.stringify(progress)).toContain("\"state\":\"failed\"");
  });

  it("sends files referenced by agent output after the text reply", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const files: Array<{ chatId: string; filePath: string }> = [];
    const directory = await mkdtemp(join(tmpdir(), "feegle-agent-file-"));
    const filePath = join(directory, "prototype.zip");
    await writeFile(filePath, "zip");
    const responder = new FeishuCommandResponder(
      fakeClient(replies, files),
      fakeAgent([], `原型已生成。\nfeegle:file:${filePath}`)
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_5",
      command: { type: "unknown", raw: "做一个登录页原型" }
    });

    expect(replies).toEqual([
      {
        messageId: "om_5",
        text: "原型已生成。"
      }
    ]);
    expect(files).toEqual([{ chatId: "oc_1", filePath }]);
  });

  it("reports missing files referenced by agent output", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      fakeAgent([], "结果已生成。\nfeegle:file:/tmp/does-not-exist.zip")
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_7",
      command: { type: "unknown", raw: "生成原型" }
    });

    expect(replies.at(-1)?.text).toBe("文件发送失败：/tmp/does-not-exist.zip 不存在或不可读取。");
  });

  it("uses the configured agent display name in progress and failure replies", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies, [], progress),
      failingAgent("claude failed"),
      { agentDisplayName: "Claude Code" }
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_6",
      command: { type: "unknown", raw: "处理这个需求" }
    });

    expect(replies).toEqual([
      {
        messageId: "om_6",
        text: "Claude Code 分析失败：claude failed"
      }
    ]);
    expect(JSON.stringify(progress)).toContain("\"state\":\"failed\"");
  });

  it("adds processing reaction and swaps it for done reaction", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const reactions: unknown[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies, [], [], reactions),
      fakeAgent([], "完成"),
      { reactionEmoji: "OnIt", doneEmoji: "DONE" }
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_8",
      command: { type: "unknown", raw: "处理这个需求" }
    });

    expect(reactions).toEqual([
      { kind: "add", messageId: "om_8", emojiType: "OnIt" },
      { kind: "remove", messageId: "om_8", reactionId: "reaction_OnIt" },
      { kind: "add", messageId: "om_8", emojiType: "DONE" }
    ]);
  });
});

function fakeClient(
  replies: Array<{ messageId: string; text: string }>,
  files: Array<{ chatId: string; filePath: string }> = [],
  progress: unknown[] = [],
  reactions: unknown[] = []
): FeishuClientPort {
  return {
    async sendText(chatId, text) {
      replies.push({ messageId: chatId, text });
      return "om_reply";
    },
    async sendInteractiveCard() {
      return "om_card";
    },
    async sendFile(chatId, filePath) {
      files.push({ chatId, filePath });
      return "om_file";
    },
    async replyText(messageId, text) {
      replies.push({ messageId, text });
      return "om_reply";
    },
    async replyInteractiveCard(messageId, card) {
      progress.push({ kind: "replyCard", messageId, card });
      return "om_progress";
    },
    async updateInteractiveCard() {},
    async updateProgress(messageId, snapshot) {
      progress.push({ kind: "updateProgress", messageId, snapshot });
    },
    async addReaction(messageId, emojiType) {
      reactions.push({ kind: "add", messageId, emojiType });
      return `reaction_${emojiType}`;
    },
    async removeReaction(messageId, reactionId) {
      reactions.push({ kind: "remove", messageId, reactionId });
    }
  };
}

function fakeAgent(calls: unknown[], plan: string): AgentCli {
  return {
    async generatePrototype() {
      throw new Error("generatePrototype should not be called");
    },
    async generatePlan(context, options) {
      calls.push(context);
      await options?.onProgress?.({ kind: "tool_result", tool: "Codex", text: "工具结果" });
      return plan;
    },
    async runDevelopmentTask() {
      throw new Error("runDevelopmentTask should not be called");
    }
  };
}

function failingAgent(message: string): AgentCli {
  return {
    async generatePrototype() {
      throw new Error("generatePrototype should not be called");
    },
    async generatePlan() {
      throw new Error(message);
    },
    async runDevelopmentTask() {
      throw new Error("runDevelopmentTask should not be called");
    }
  };
}
