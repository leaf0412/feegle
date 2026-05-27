import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatBindingStore } from "../../../src/repositories/chat-binding-store.js";
import { RepositoryStore } from "../../../src/repositories/repository-store.js";
import { BindCommandHandler } from "../../../src/platform/commands/repo/bind-command.js";
import { RepoClearCommandHandler } from "../../../src/platform/commands/repo/repo-clear-command.js";
import { RepoShowCommandHandler } from "../../../src/platform/commands/repo/repo-show-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const def = defineSlashCommand("x", "/x", "x", "repo", "cmd:/x");

function makeContext(args = "", email = "a@b.com"): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sender: { platform: "feishu", userId: "u_1", email },
    definition: def,
    raw: "/x",
    args
  };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-bind-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("BindCommandHandler", () => {
  it("rejects when fewer than 2 args so /bind <branch> with no base does not silently bind", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const handler = new BindCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(makeContext("only-branch"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("用法");
  });

  it("flags unknown repos so typos don't get silently dropped from the bind", async () => {
    const repos = await RepositoryStore.load(home);
    await repos.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const bindings = await ChatBindingStore.load(home);
    const handler = new BindCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(makeContext("feature/x main alpha typo"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("未识别");
    expect(reply.text).toContain("typo");
  });

  it("persists binding with resolved repo ids so /repo show can render later", async () => {
    const repos = await RepositoryStore.load(home);
    const repo = await repos.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const bindings = await ChatBindingStore.load(home);
    const handler = new BindCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    await handler.execute(makeContext("feature/x main alpha"));
    expect(bindings.get("user:u_1")?.repositoryIds).toEqual([repo.id]);
  });
});

describe("RepoShowCommandHandler", () => {
  it("explains when not bound so users know what to do next", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const handler = new RepoShowCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("/bind");
  });

  it("renders bound repos by name so users can verify the binding", async () => {
    const repos = await RepositoryStore.load(home);
    const repo = await repos.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const bindings = await ChatBindingStore.load(home);
    await bindings.upsert({ chatId: "user:u_1", branch: "feature/x", baseBranch: "main", repositoryIds: [repo.id] });
    const handler = new RepoShowCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("alpha");
    expect(reply.text).toContain("feature/x");
  });
});

describe("RepoClearCommandHandler", () => {
  it("reports no-binding so /repo clear in fresh chat doesn't lie about removing", async () => {
    const bindings = await ChatBindingStore.load(home);
    const handler = new RepoClearCommandHandler({ chatBindingStore: bindings });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("无需清除");
  });

  it("removes existing binding so subsequent /repo show goes back to 'not bound'", async () => {
    const bindings = await ChatBindingStore.load(home);
    await bindings.upsert({ chatId: "user:u_1", branch: "x", baseBranch: "main" });
    const handler = new RepoClearCommandHandler({ chatBindingStore: bindings });
    await handler.execute(makeContext());
    expect(bindings.get("user:u_1")).toBeUndefined();
  });
});
