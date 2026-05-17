import { describe, expect, it, vi } from "vitest";
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

  it("does not reply or invoke the agent when a message is record-only", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const agentCalls: unknown[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies, [], progress),
      fakeAgent(agentCalls, "should not be called")
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_record_only",
      command: { type: "unknown", raw: "群里普通聊天" },
      shouldRespond: false
    });

    expect(replies).toEqual([]);
    expect(progress).toEqual([]);
    expect(agentCalls).toEqual([]);
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

  it("replies to /help with a navigable command card", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress));

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_help",
      command: { type: "help", groupKey: "repo" }
    });

    expect(replies).toEqual([]);
    expect(JSON.stringify(progress)).toContain("命令面板 · 仓库");
    expect(JSON.stringify(progress)).toContain("nav:/command bind");
  });

  it("updates the current card for help navigation actions", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress));

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_card",
      command: {
        type: "platform_action",
        action: { kind: "nav", command: "/command", args: "repo_list", raw: "nav:/command repo_list" }
      }
    });

    expect(replies).toEqual([]);
    expect(progress).toEqual([
      expect.objectContaining({
        kind: "updateCard",
        messageId: "om_card"
      })
    ]);
    expect(JSON.stringify(progress)).toContain("/repo list");
    expect(JSON.stringify(progress)).toContain("nav:/help repo");
  });

  it("acknowledges registered but unimplemented slash commands without invoking the agent", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const agentCalls: unknown[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      fakeAgent(agentCalls, "should not be called")
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_role",
      command: {
        type: "slash_command",
        definition: {
          id: "repo_show",
          command: "/repo show",
          description: "显示当前绑定",
          groupKey: "repo",
          source: "feegle",
          action: "nav:/command repo_show"
        },
        raw: "/repo show"
      }
    });

    expect(agentCalls).toEqual([]);
    expect(replies.at(-1)?.text).toContain("已登记命令：/repo show");
  });

  it("lists registered repositories for /repo list without invoking the agent", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const agentCalls: unknown[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      fakeAgent(agentCalls, "should not be called"),
      {
        repositories: {
          list: () => [
            {
              id: "repo_1",
              name: "web",
              remoteUrl: "git@example.com:team/web.git",
              defaultBaseBranch: "main",
              createdAt: new Date("2026-05-17T00:00:00.000Z"),
              updatedAt: new Date("2026-05-17T00:00:00.000Z")
            },
            {
              id: "repo_2",
              name: "api",
              remoteUrl: "git@example.com:team/api.git",
              defaultBaseBranch: "develop",
              createdAt: new Date("2026-05-17T00:00:00.000Z"),
              updatedAt: new Date("2026-05-17T00:00:00.000Z")
            }
          ]
        }
      }
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_repo_list",
      command: {
        type: "slash_command",
        definition: {
          id: "repo_list",
          command: "/repo list",
          description: "列出已注册仓库",
          groupKey: "repo",
          source: "feegle",
          action: "cmd:/repo list"
        },
        raw: "/repo list"
      }
    });

    expect(agentCalls).toEqual([]);
    expect(replies).toEqual([
      {
        messageId: "om_repo_list",
        text: [
          "已注册仓库：",
          "1. web (repo_1) · main · git@example.com:team/web.git",
          "2. api (repo_2) · develop · git@example.com:team/api.git"
        ].join("\n")
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

  it("still replies when Feishu reactions are unavailable", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const responder = new FeishuCommandResponder(
      {
        ...fakeClient(replies, [], progress),
        async addReaction() {
          throw new Error("reaction permission denied");
        },
        async removeReaction() {}
      },
      fakeAgent([], "完成"),
      { reactionEmoji: "OnIt", doneEmoji: "DONE" }
    );

    try {
      await expect(
        responder.handleCommand({
          source: "message",
          chatId: "oc_1",
          messageId: "om_reaction_denied",
          command: { type: "unknown", raw: "处理这个需求" }
        })
      ).resolves.toBeUndefined();

      expect(replies).toEqual([
        {
          messageId: "om_reaction_denied",
          text: "完成"
        }
      ]);
      expect(JSON.stringify(progress)).toContain("\"state\":\"completed\"");
      expect(consoleWarn).toHaveBeenCalledWith("Feishu reaction add failed", "reaction permission denied");
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("does not block the agent reply when adding the processing reaction hangs", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const responder = new FeishuCommandResponder(
      {
        ...fakeClient(replies, [], progress),
        async addReaction() {
          await new Promise(() => undefined);
          return "never";
        }
      },
      fakeAgent([], "收到 hello"),
      { reactionEmoji: "OnIt", reactionTimeoutMs: 1 }
    );

    try {
      await expect(
        Promise.race([
          responder.handleCommand({
            source: "message",
            chatId: "oc_1",
            messageId: "om_reaction_hangs",
            command: { type: "unknown", raw: "hello" }
          }),
          delay(20).then(() => {
            throw new Error("handleCommand stayed blocked on addReaction");
          })
        ])
      ).resolves.toBeUndefined();

      expect(replies).toEqual([
        {
          messageId: "om_reaction_hangs",
          text: "收到 hello"
        }
      ]);
      expect(consoleWarn).toHaveBeenCalledWith("Feishu reaction add timed out", {
        messageId: "om_reaction_hangs",
        timeoutMs: 1
      });
    } finally {
      consoleWarn.mockRestore();
    }
  });

  it("emits trace stages around visible replies and agent execution", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const stages: string[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      fakeAgent([], "收到 hello"),
      {
        trace: (event) => stages.push(event.stage)
      }
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_trace",
      command: { type: "unknown", raw: "hello" }
    });

    expect(stages).toEqual([
      "received",
      "progress_reply_start",
      "progress_reply_done",
      "progress_update_start",
      "progress_update_done",
      "agent_start",
      "progress_update_start",
      "progress_update_done",
      "agent_done",
      "progress_update_start",
      "progress_update_done",
      "reply_text_start",
      "reply_text_done",
      "progress_update_start",
      "progress_update_done",
      "completed"
    ]);
  });

  it("keeps handling the message when the trace hook throws", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      fakeAgent([], "trace hook did not block"),
      {
        trace: () => {
          throw new Error("trace sink failed");
        }
      }
    );

    try {
      await responder.handleCommand({
        source: "message",
        chatId: "oc_1",
        messageId: "om_trace_throws",
        command: { type: "unknown", raw: "hello" }
      });

      expect(replies).toEqual([
        {
          messageId: "om_trace_throws",
          text: "trace hook did not block"
        }
      ]);
      expect(consoleWarn).toHaveBeenCalledWith("Feishu command trace hook failed", "trace sink failed");
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    async updateInteractiveCard(messageId, card) {
      progress.push({ kind: "updateCard", messageId, card });
    },
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
