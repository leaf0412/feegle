import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoryStore } from "../../../src/repositories/repository-store.js";
import { ChatBindingStore } from "../../../src/repositories/chat-binding-store.js";
import { RepoRemoveCommandHandler } from "../../../src/platform/commands/repo/repo-remove-command.js";
import { BindRepoCommandHandler } from "../../../src/platform/commands/repo/bind-repo-command.js";
import { RepoShowCommandHandler } from "../../../src/platform/commands/repo/repo-show-command.js";
import { RepoClearCommandHandler } from "../../../src/platform/commands/repo/repo-clear-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const def = defineSlashCommand("repo_remove", "/repo remove", "rm", "repo", "cmd:/repo remove");

function makeContext(args = "", email = "a@b.com"): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sender: { platform: "feishu", userId: "u_1", email },
    definition: def,
    raw: "/repo remove",
    args
  };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-repo-mut-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("RepoRemoveCommandHandler", () => {
  it("returns hint when query empty so accidental /repo remove does not silently fail", async () => {
    const store = await RepositoryStore.load(home);
    const handler = new RepoRemoveCommandHandler({
      repositoryStore: store,
      ownerEmails: new Set(["a@b.com"])
    });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("用法");
  });

  it("reports not-found so users see explicit feedback for typos", async () => {
    const store = await RepositoryStore.load(home);
    const handler = new RepoRemoveCommandHandler({
      repositoryStore: store,
      ownerEmails: new Set(["a@b.com"])
    });
    const reply = await handler.execute(makeContext("nope"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("未找到");
  });

  it("removes matched repo by #index so the listed-then-remove flow works", async () => {
    const store = await RepositoryStore.load(home);
    await store.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const handler = new RepoRemoveCommandHandler({
      repositoryStore: store,
      ownerEmails: new Set(["a@b.com"])
    });
    await handler.execute(makeContext("#1"));
    expect(store.list()).toEqual([]);
  });
});

describe("repo binding scope (single chat vs group)", () => {
  function scopedContext(chatType: string, userId: string, args = ""): SlashCommandContext {
    return {
      source: "message",
      chatId: "oc_shared",
      messageId: "om_1",
      chatType,
      sender: { platform: "feishu", userId },
      definition: def,
      raw: "/bind",
      args
    };
  }

  it("a single-chat bind is keyed by user, invisible to a group on the same chat id", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const bind = new BindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const show = new RepoShowCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });

    await bind.execute(scopedContext("p2p", "ou_alice", "https://x/alpha"));

    const groupShow = await show.execute(scopedContext("group", "ou_alice"));
    if (groupShow.kind !== "text") throw new Error("expected text");
    expect(groupShow.text).toContain("未绑定");

    const p2pShow = await show.execute(scopedContext("p2p", "ou_alice"));
    if (p2pShow.kind !== "text") throw new Error("expected text");
    expect(p2pShow.text).toContain("alpha");
  });

  it("a group bind is shared and keyed by chat id", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const bind = new BindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const show = new RepoShowCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });

    await bind.execute(scopedContext("group", "ou_alice", "https://x/beta"));
    const otherShow = await show.execute(scopedContext("group", "ou_bob"));
    if (otherShow.kind !== "text") throw new Error("expected text");
    expect(otherShow.text).toContain("beta");
  });

  it("clear removes only the resolved scope's binding", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const bind = new BindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const clear = new RepoClearCommandHandler({ chatBindingStore: bindings });

    await bind.execute(scopedContext("p2p", "ou_alice", "https://x/alpha"));
    const removed = await clear.execute(scopedContext("p2p", "ou_alice"));
    if (removed.kind !== "text") throw new Error("expected text");
    expect(removed.text).toContain("已清除");
  });
});
