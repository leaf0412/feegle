import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoryStore } from "../../../src/repositories/repository-store.js";
import { RepoRemoveCommandHandler } from "../../../src/platform/commands/repo/repo-remove-command.js";
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
