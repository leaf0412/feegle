import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { migrate } from "../../src/infra/app/runtime-db.js";
import { RepositoryStore } from "../../src/resources/repositories/repository-store.js";
import { ChatBindingStore } from "../../src/resources/repositories/chat-binding-store.js";
import { FeishuCommandResponder } from "../../src/feishu/feishu-command-responder.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import { makeFakeFeishuClient } from "../fixtures/fake-feishu-client.js";
import { buildSlashCommandRegistry } from "../../src/platform/build-slash-command-registry.js";
import type { RepositoryRecord } from "../../src/domain/models.js";
import type { SlashCommandDefinition } from "../../src/platform/slash-command-catalog.js";
import type { SlashCommandHandler, SlashCommandRegistry } from "../../src/platform/slash-command-handler.js";
import { stubSchedulerSlashDeps } from "../fixtures/scheduler-deps.js";

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

  it("updates the current card for workbench plan revision requests", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), {
      registry: testRegistry(),
      workbench: {
        handlePlanRevise: async () => ({
          kind: "feishu_card_update",
          card: { body: { elements: [{ tag: "form", name: "workbench_plan_revision" }] } }
        })
      }
    });

    await responder.handleCommand({
      source: "card",
      chatId: "oc_1",
      messageId: "om_card",
      command: {
        type: "workbench_plan_revise",
        planId: "plan_1",
        version: 1
      }
    });

    expect(replies).toEqual([]);
    expect(progress).toEqual([
      {
        kind: "updateCard",
        messageId: "om_card",
        card: { body: { elements: [{ tag: "form", name: "workbench_plan_revision" }] } }
      }
    ]);
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

  it("replies with a configuration prompt for chat when no chat handler is wired", async () => {
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
        text: "尚未配置 agent。请运行 /provider register <kind> cwd=<path> 注册并 /provider use 激活。"
      }
    ]);
    expect(progress).toEqual([]);
  });

  it("delegates chat type to the chat handler when configured", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const calls: Array<{ chatId: string; sessionKey: string; userText: string; triggerMessageId: string }> = [];
    const chatHandler = {
      handle: async (request: { chatId: string; sessionKey: string; userText: string; triggerMessageId: string }) => {
        calls.push(request);
        return { status: "delivered" as const };
      }
    } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;

    const responder = new FeishuCommandResponder(fakeClient(replies), {
      registry: testRegistry(),
      chatHandler
    });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_chat",
      sessionKey: "feishu:oc_1:ou_alice",
      command: { type: "chat", raw: "what's your model?" }
    });

    expect(calls).toEqual([
      {
        chatId: "oc_1",
        sessionKey: "feishu:oc_1:ou_alice",
        userText: "what's your model?",
        triggerMessageId: "om_chat"
      }
    ]);
    expect(replies).toEqual([]);
  });

  it("prompts an interactive bind-repo card (not text) when the group has no bound repo", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const calls: unknown[] = [];
    const chatHandler = { handle: async (r: unknown) => { calls.push(r); return { status: "delivered" as const }; } } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), {
      registry: testRegistry(), chatHandler, chatBindingStore: fakeBindingStore({})
    });
    await responder.handleCommand({
      source: "message", chatId: "oc_g", messageId: "om_1", chatType: "group",
      command: { type: "chat", raw: "帮我看看这个 bug" }
    });
    expect(calls).toEqual([]);
    expect(replies).toEqual([]);
    expect(progress).toHaveLength(1);
    expect((progress[0] as { kind: string }).kind).toBe("replyCard");
    const json = JSON.stringify(progress[0]);
    expect(json).toContain("绑定仓库");
    expect(json).toContain("act:/repo bind_submit");
    // scope baked in so the eventual bind lands on this group, not the clicker
    expect(json).toContain("\"scope_key\":\"oc_g\"");
  });

  it("prompts the bind-repo card when the binding has zero repos", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const calls: unknown[] = [];
    const chatHandler = { handle: async (r: unknown) => { calls.push(r); return { status: "delivered" as const }; } } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), {
      registry: testRegistry(), chatHandler, chatBindingStore: fakeBindingStore({ oc_g: { repositoryIds: [] } })
    });
    await responder.handleCommand({
      source: "message", chatId: "oc_g", messageId: "om_1", chatType: "group",
      command: { type: "chat", raw: "hi" }
    });
    expect(calls).toEqual([]);
    expect(replies).toEqual([]);
    expect(JSON.stringify(progress)).toContain("绑定仓库");
  });

  it("allows group chat once a repo is bound", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const calls: unknown[] = [];
    const chatHandler = { handle: async (r: unknown) => { calls.push(r); return { status: "delivered" as const }; } } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(fakeClient(replies), {
      registry: testRegistry(), chatHandler, chatBindingStore: fakeBindingStore({ oc_g: { repositoryIds: ["1"] } })
    });
    await responder.handleCommand({
      source: "message", chatId: "oc_g", messageId: "om_1", chatType: "group",
      command: { type: "chat", raw: "hi" }
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ chatId: "oc_g", userText: "hi", triggerMessageId: "om_1" });
  });

  it("blocks group chat when no binding store is wired (safe default, not a bypass)", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const calls: unknown[] = [];
    const chatHandler = { handle: async (r: unknown) => { calls.push(r); return { status: "delivered" as const }; } } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), {
      registry: testRegistry(), chatHandler // no chatBindingStore
    });
    await responder.handleCommand({
      source: "message", chatId: "oc_g", messageId: "om_1", chatType: "group",
      command: { type: "chat", raw: "hi" }
    });
    expect(calls).toEqual([]);
    expect(replies).toEqual([]);
    expect(JSON.stringify(progress)).toContain("绑定仓库");
  });

  it("binds the repo and updates the card in place on a bind_repo_submit", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const progress: unknown[] = [];
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    const repositoryStore = new RepositoryStore(db);
    const chatBindingStore = new ChatBindingStore(db);
    const responder = new FeishuCommandResponder(fakeClient(replies, [], progress), {
      registry: testRegistry(), repositoryStore, chatBindingStore
    });

    await responder.handleCommand({
      source: "card", chatId: "oc_g", messageId: "om_card",
      command: { type: "bind_repo_submit", url: "https://x/kuavo", scopeKey: "oc_g", scopeNoun: "本群" }
    });

    const record = repositoryStore.findByUrl("https://x/kuavo");
    expect(record).toBeDefined();
    expect(chatBindingStore.get("oc_g")?.repositoryIds).toEqual([record!.id]);
    expect(replies).toEqual([]);
    expect(progress).toHaveLength(1);
    expect((progress[0] as { kind: string }).kind).toBe("updateCard");
    expect((progress[0] as { messageId: string }).messageId).toBe("om_card");
    expect(JSON.stringify(progress[0])).toContain("已为本群绑定仓库");
    db.close();
  });

  it("reports gracefully when bind_repo_submit arrives without stores wired", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const responder = new FeishuCommandResponder(fakeClient(replies), { registry: testRegistry() });

    await responder.handleCommand({
      source: "card", chatId: "oc_g", messageId: "om_card",
      command: { type: "bind_repo_submit", url: "https://x/kuavo", scopeKey: "oc_g", scopeNoun: "本群" }
    });

    expect(replies).toHaveLength(1);
    expect(replies[0].text).toContain("尚未接入");
  });

  it("sweeps sibling prompt cards to an inert state when one of them binds", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    const repositoryStore = new RepositoryStore(db);
    const chatBindingStore = new ChatBindingStore(db);
    const events = trackingClient();
    const chatHandler = { handle: async () => ({ status: "delivered" as const }) } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(events.client, { registry: testRegistry(), repositoryStore, chatBindingStore, chatHandler });

    // two people chat in an unbound group → two prompt cards (card_1, card_2)
    await responder.handleCommand({ source: "message", chatId: "oc_g", messageId: "m1", chatType: "group", command: { type: "chat", raw: "hi" } });
    await responder.handleCommand({ source: "message", chatId: "oc_g", messageId: "m2", chatType: "group", command: { type: "chat", raw: "hi again" } });
    // bind via the second card
    await responder.handleCommand({ source: "card", chatId: "oc_g", messageId: "card_2", command: { type: "bind_repo_submit", url: "https://x/kuavo", scopeKey: "oc_g", scopeNoun: "本群" } });

    expect(events.update("card_2")).toContain("已为本群绑定仓库"); // the clicked card
    expect(events.update("card_1")).toContain("已失效"); // the swept sibling
    db.close();
  });

  it("cancel resolves only its own card and is excluded from a later sweep", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    const repositoryStore = new RepositoryStore(db);
    const chatBindingStore = new ChatBindingStore(db);
    const events = trackingClient();
    const chatHandler = { handle: async () => ({ status: "delivered" as const }) } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(events.client, { registry: testRegistry(), repositoryStore, chatBindingStore, chatHandler });

    await responder.handleCommand({ source: "message", chatId: "oc_g", messageId: "m1", chatType: "group", command: { type: "chat", raw: "hi" } });
    await responder.handleCommand({ source: "message", chatId: "oc_g", messageId: "m2", chatType: "group", command: { type: "chat", raw: "hi again" } });
    // cancel card_1, then bind via card_2
    await responder.handleCommand({ source: "card", chatId: "oc_g", messageId: "card_1", command: { type: "bind_repo_cancel", scopeKey: "oc_g" } });
    await responder.handleCommand({ source: "card", chatId: "oc_g", messageId: "card_2", command: { type: "bind_repo_submit", url: "https://x/kuavo", scopeKey: "oc_g", scopeNoun: "本群" } });

    // card_1 was cancelled and untracked → the later bind must not overwrite it with 已失效
    expect(events.updates("card_1")).toEqual(["已取消"]);
    db.close();
  });

  it("sweeps leftover prompt cards on the next chat once the group is bound elsewhere", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    const repositoryStore = new RepositoryStore(db);
    const chatBindingStore = new ChatBindingStore(db);
    const events = trackingClient();
    const handled: unknown[] = [];
    const chatHandler = { handle: async (r: unknown) => { handled.push(r); return { status: "delivered" as const }; } } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(events.client, { registry: testRegistry(), repositoryStore, chatBindingStore, chatHandler });

    await responder.handleCommand({ source: "message", chatId: "oc_g", messageId: "m1", chatType: "group", command: { type: "chat", raw: "hi" } });
    // bind out-of-band (e.g. via /bind_repo) — the floating card_1 is now stale
    const repo = await repositoryStore.add({ name: "kuavo", remoteUrl: "https://x/kuavo", defaultBaseBranch: "main" });
    await chatBindingStore.addRepository("oc_g", repo.id);
    // next chat in the now-bound group
    await responder.handleCommand({ source: "message", chatId: "oc_g", messageId: "m2", chatType: "group", command: { type: "chat", raw: "let's go" } });

    expect(events.update("card_1")).toContain("已失效");
    expect(handled).toHaveLength(1); // chat proceeded normally
    db.close();
  });

  it("does not gate single (p2p) chat — it runs without a binding", async () => {
    const replies: Array<{ messageId: string; text: string }> = [];
    const calls: unknown[] = [];
    const chatHandler = { handle: async (r: unknown) => { calls.push(r); return { status: "delivered" as const }; } } as unknown as import("../../src/feishu/feishu-chat-handler.js").FeishuChatHandler;
    const responder = new FeishuCommandResponder(fakeClient(replies), {
      registry: testRegistry(), chatHandler, chatBindingStore: fakeBindingStore({})
    });
    await responder.handleCommand({
      source: "message", chatId: "oc_dm", messageId: "om_1", chatType: "p2p",
      command: { type: "chat", raw: "hi" }
    });
    expect(calls).toHaveLength(1);
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
          text: "尚未配置 agent。请运行 /provider register <kind> cwd=<path> 注册并 /provider use 激活。"
        }
      ]);
      expect(consoleWarn).toHaveBeenCalledWith("Feishu command trace hook failed", "trace sink failed");
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

/**
 * A fake client that hands out a fresh, distinct id for every interactive-card
 * reply (card_1, card_2, …) and records every card update, so tests can assert
 * which specific card was swept / updated.
 */
function trackingClient(): {
  client: FeishuClientPort;
  update(messageId: string): string;
  updates(messageId: string): string[];
} {
  let counter = 0;
  const updatesByMessage = new Map<string, string[]>();
  const client = makeFakeFeishuClient({
    async replyText() {
      return "om_reply";
    },
    async replyInteractiveCard() {
      counter += 1;
      return `card_${counter}`;
    },
    async updateInteractiveCard(messageId, card) {
      const list = updatesByMessage.get(messageId) ?? [];
      list.push(JSON.stringify(card));
      updatesByMessage.set(messageId, list);
    }
  });
  return {
    client,
    update: (messageId) => (updatesByMessage.get(messageId) ?? []).join("\n"),
    updates: (messageId) =>
      (updatesByMessage.get(messageId) ?? []).map((json) =>
        json.includes("已取消") ? "已取消" : json.includes("已失效") ? "已失效" : json.includes("已为") ? "已绑定" : json
      )
  };
}

function fakeBindingStore(
  bindings: Record<string, { repositoryIds: string[] }>
): import("../../src/resources/repositories/chat-binding-store.js").ChatBindingStore {
  return { get: (id: string) => bindings[id] } as unknown as import("../../src/resources/repositories/chat-binding-store.js").ChatBindingStore;
}

function testRegistry(repositories: RepositoryRecord[] = []): SlashCommandRegistry {
  return buildSlashCommandRegistry(
    stubSchedulerSlashDeps({ repositories: { list: () => repositories.map((record) => ({ ...record })) } })
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
