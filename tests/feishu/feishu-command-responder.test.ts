import { describe, expect, it } from "vitest";
import { FeishuCommandResponder } from "@integrations/feishu/feishu-command-responder.js";
import type { FeishuClientPort } from "@integrations/feishu/feishu-client.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";
import { buildSlashCommandRegistry } from "@platform/build-slash-command-registry.js";
import type { RepositoryRecord } from "@domain/models.js";
import type { SlashCommandDefinition } from "@platform/slash-command-catalog.js";
import type { SlashCommandHandler, SlashCommandRegistry } from "@platform/slash-command-handler.js";
import { stubSchedulerSlashDeps } from "../fixtures/scheduler-deps.js";

describe("FeishuCommandResponder", () => {
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

  it("dispatches cmd: card actions through the slash command registry", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_cmd",
      sender: { platform: "feishu", userId: "ou_alice" },
      command: {
        type: "platform_action",
        action: { kind: "cmd", command: "/whoami", args: "", raw: "cmd:/whoami" }
      }
    });

    expect(replies).toHaveLength(1);
    expect(replies[0]?.messageId).toBe("om_cmd");
    expect(replies[0]?.text).toContain("platform: feishu");
    expect(replies[0]?.text).toContain("userId: ou_alice");
  });

  it("dispatches act: card actions through the slash command registry", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_act",
      sender: { platform: "feishu", userId: "ou_bob" },
      command: {
        type: "platform_action",
        action: { kind: "act", command: "/whoami", args: "", raw: "act:/whoami" }
      }
    });

    expect(replies[0]?.text).toContain("platform: feishu");
  });

  it("replies 未知命令 when a cmd/act platform action targets an unregistered command", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_unknown",
      command: {
        type: "platform_action",
        action: { kind: "act", command: "/push", args: "repo web", raw: "act:/push repo web" }
      }
    });

    expect(replies).toEqual([
      { messageId: "om_unknown", text: "未知命令：act:/push repo web" }
    ]);
  });

  it("replies 仍在规划中 when a cmd: platform action targets a planned slash command", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_planned",
      command: {
        type: "platform_action",
        action: { kind: "cmd", command: "/new", args: "", raw: "cmd:/new" }
      }
    });

    expect(replies[0]?.text).toContain("仍在规划中");
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

  it("resolves slash input through the same registry that executes handlers", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const definition: SlashCommandDefinition = {
      id: "sample_external",
      command: "/sample",
      description: "sample",
      groupKey: "system",
      action: "cmd:/sample"
    };
    const handler: SlashCommandHandler = {
      id: "sample_external",
      async execute(context) {
        return { kind: "text", text: `external: ${context.args}` };
      }
    };
    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [
        {
          id: "external",
          register: (target) => target.registerCommand(definition, handler)
        }
      ]
    });
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_sample",
      command: { type: "slash_input", raw: "/sample hello world" }
    });

    expect(replies).toEqual([{ messageId: "om_sample", text: "external: hello world" }]);
  });

  it("threads chatType into the slash command context so handlers can scope per chat type", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const definition: SlashCommandDefinition = {
      id: "chat_type_probe",
      command: "/probe",
      description: "probe",
      groupKey: "repo",
      action: "cmd:/probe"
    };
    let seenChatType: string | undefined = "unset";
    const handler: SlashCommandHandler = {
      id: "chat_type_probe",
      async execute(context) {
        seenChatType = context.chatType;
        return { kind: "text", text: "ok" };
      }
    };
    const registry = buildSlashCommandRegistry({
      repositories: { list: () => [] },
      defaults: false,
      modules: [
        {
          id: "probe",
          register: (target) => target.registerCommand(definition, handler)
        }
      ]
    });
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_probe",
      chatType: "p2p",
      command: { type: "slash_input", raw: "/probe" }
    });

    expect(seenChatType).toBe("p2p");
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

  it("emits trace stages around slash reply delivery", async () => {
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
      command: { type: "unknown", raw: "test" }
    });

    expect(stages).toEqual([
      "received",
      "reply_start",
      "reply_done",
      "completed"
    ]);
  });
});

function testRegistry(repositories: RepositoryRecord[] = []): SlashCommandRegistry {
  return buildSlashCommandRegistry(
    stubSchedulerSlashDeps({
      operatorWorkspaceId: "ws_test",
      repositories: { list: () => repositories.map((record) => ({ ...record })) }
    })
  );
}

function fakeClient(
  replies: Array<{ messageId: string; text: string }>,
  files: Array<{ chatId: string; filePath: string }> = [],
  progress: unknown[] = [],
  reactions: unknown[] = []
): FeishuClientPort {
  return makeFakeFeishuClient({
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
  });
}
