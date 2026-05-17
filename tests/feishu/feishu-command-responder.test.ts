import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("reports agent failures back to Feishu instead of throwing", async () => {
    const replies: Array<{ chatId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), failingAgent("codex exec failed"));

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
        chatId: "oc_1",
        text: "收到需求，正在交给 Codex 分析..."
      },
      {
        chatId: "oc_1",
        text: "Codex 分析失败：codex exec failed"
      }
    ]);
  });

  it("sends files referenced by agent output after the text reply", async () => {
    const replies: Array<{ chatId: string; text: string }> = [];
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
        chatId: "oc_1",
        text: "收到需求，正在交给 Codex 分析..."
      },
      {
        chatId: "oc_1",
        text: "原型已生成。"
      }
    ]);
    expect(files).toEqual([{ chatId: "oc_1", filePath }]);
  });

  it("uses the configured agent display name in progress and failure replies", async () => {
    const replies: Array<{ chatId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
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
        chatId: "oc_1",
        text: "收到需求，正在交给 Claude Code 分析..."
      },
      {
        chatId: "oc_1",
        text: "Claude Code 分析失败：claude failed"
      }
    ]);
  });
});

function fakeClient(
  replies: Array<{ chatId: string; text: string }>,
  files: Array<{ chatId: string; filePath: string }> = []
): FeishuClientPort {
  return {
    async sendText(chatId, text) {
      replies.push({ chatId, text });
      return "om_reply";
    },
    async sendInteractiveCard() {
      return "om_card";
    },
    async sendFile(chatId, filePath) {
      files.push({ chatId, filePath });
      return "om_file";
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
