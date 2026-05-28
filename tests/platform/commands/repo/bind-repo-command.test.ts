import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoryStore } from "../../../../src/repositories/repository-store.js";
import { ChatBindingStore } from "../../../../src/repositories/chat-binding-store.js";
import { BindRepoCommandHandler } from "../../../../src/platform/commands/repo/bind-repo-command.js";
import type { SlashCommandContext } from "../../../../src/platform/slash-command-handler.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "feegle-bindrepo-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

function ctx(args: string, chatType = "group", userId = "ou_a"): SlashCommandContext {
  return {
    source: "message", chatId: "oc_g", messageId: "om_1", chatType,
    sender: { platform: "feishu", userId },
    definition: { id: "bind_repo", command: "/bind_repo <url>", groupKey: "repo", helpKey: "" } as never,
    raw: "/bind_repo", args
  };
}

describe("BindRepoCommandHandler", () => {
  it("auto-registers an unknown url (no network) and binds it to the group", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const handler = new BindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(ctx("https://www.lejuhub.com/pc/kuavo-model-training"));
    if (reply.kind !== "text") throw new Error("expected text");
    const record = repos.findByUrl("https://www.lejuhub.com/pc/kuavo-model-training");
    expect(record?.name).toBe("kuavo-model-training");
    expect(bindings.get("oc_g")?.repositoryIds).toEqual([record!.id]);
    expect(reply.text).toContain("kuavo-model-training");
  });

  it("reuses an already-registered url and is idempotent on a second bind", async () => {
    const repos = await RepositoryStore.load(home);
    const existing = await repos.add({ name: "kuavo", remoteUrl: "https://x/kuavo", defaultBaseBranch: "main" });
    const bindings = await ChatBindingStore.load(home);
    const handler = new BindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    await handler.execute(ctx("https://x/kuavo"));
    await handler.execute(ctx("https://x/kuavo"));
    expect(repos.list().length).toBe(1);
    expect(bindings.get("oc_g")?.repositoryIds).toEqual([existing.id]);
  });

  it("keys single chat by user, not the conversation id", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const handler = new BindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    await handler.execute(ctx("https://x/solo", "p2p", "ou_a"));
    expect(bindings.get("oc_g")).toBeUndefined();
    expect(bindings.get("user:ou_a")?.repositoryIds.length).toBe(1);
  });
});
