import { describe, expect, it, vi } from "vitest";
import { FeishuCommandResponder } from "../../src/feishu/feishu-command-responder.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import { buildSlashCommandRegistry } from "../../src/platform/build-slash-command-registry.js";
import type { RepositoryRecord } from "../../src/domain/models.js";
import type { SlashCommandRegistry } from "../../src/platform/slash-command-handler.js";

describe("FeishuCommandResponder", () => {
  it("replies with selected repositories", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

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

  it("does not reply when a message is record-only", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), { registry: testRegistry() });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_record_only",
      command: { type: "chat", raw: "群里普通聊天" },
      shouldRespond: false
    });

    expect(replies).toEqual([]);
    expect(progress).toEqual([]);
  });

  it("replies to push card actions", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

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

  it("ignores act: platform actions until the action router is connected", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

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

    expect(replies).toEqual([]);
  });

  it("replies to /help with a navigable command card", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), { registry: testRegistry() });

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
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), { registry: testRegistry() });

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
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

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
          action: "nav:/command repo_show"
        },
        raw: "/repo show"
      }
    });

    expect(replies.at(-1)?.text).toBe("/repo show 仍在规划中，暂未接入执行器。");
  });

  it("lists registered repositories for /repo list without invoking the agent", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      {
        registry: testRegistry([
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
        ])
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
          action: "cmd:/repo list"
        },
        raw: "/repo list"
      }
    });

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

  it("replies conversationally for chat text without invoking orchestration", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), { registry: testRegistry() });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_3",
      command: { type: "chat", raw: "hello" }
    });

    expect(replies).toEqual([
      {
        messageId: "om_3",
        text: "我在，继续说。"
      }
    ]);
    expect(progress).toEqual([]);
  });

  it("replies with placeholder text for unknown commands", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), { registry: testRegistry() });

    await expect(
      responder.handleCommand({
        source: "message",
        chatId: "oc_1",
        messageId: "om_4",
        command: { type: "unknown", raw: "/repo missing" }
      })
    ).resolves.toBeUndefined();

    expect(replies).toEqual([
      {
        messageId: "om_4",
        text: "未知命令：/repo missing"
      }
    ]);
    expect(progress).toEqual([]);
  });

  it("emits trace stages around chat replies without orchestration", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const stages: string[] = [];
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      {
        registry: testRegistry(),
        trace: (event) => stages.push(event.stage)
      }
    );

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_trace",
      command: { type: "chat", raw: "hello" }
    });

    expect(stages).toEqual([
      "received",
      "reply_text_start",
      "reply_text_done",
      "completed"
    ]);
  });

  it("keeps handling the message when the trace hook throws", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const responder = new FeishuCommandResponder(
      fakeClient(replies),
      {
        registry: testRegistry(),
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
        command: { type: "chat", raw: "hello" }
      });
      expect(replies).toEqual([
        {
          messageId: "om_trace_throws",
          text: "我在，继续说。"
        }
      ]);
      expect(consoleWarn).toHaveBeenCalledWith("Feishu command trace hook failed", "trace sink failed");
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

function testRegistry(repositories: RepositoryRecord[] = []): SlashCommandRegistry {
  return buildSlashCommandRegistry({ repositories: { list: () => repositories.map((record) => ({ ...record })) } });
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
    },
    async fetchBotOpenId() {
      return undefined;
    },
    async fetchUserName() {
      return undefined;
    },
    async fetchChatName() {
      return undefined;
    },
    async fetchChatMembers() {
      return [];
    },
    async fetchMessage() {
      return undefined;
    },
    async fetchMergeForwardItems() {
      return [];
    },
    async sendImage() {
      return undefined;
    },
    async sendAudio() {
      return undefined;
    },
    async downloadResource() {
      return undefined;
    },
    async downloadImage() {
      return undefined;
    },
    async deleteMessage() {}
  };
}
