import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoryStore } from "../../../../src/repositories/repository-store.js";
import { ChatBindingStore } from "../../../../src/repositories/chat-binding-store.js";
import { UnbindRepoCommandHandler } from "../../../../src/platform/commands/repo/unbind-repo-command.js";
import type { SlashCommandContext } from "../../../../src/platform/slash-command-handler.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "feegle-unbind-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

function ctx(args: string): SlashCommandContext {
  return {
    source: "message", chatId: "oc_g", messageId: "om_1", chatType: "group",
    sender: { platform: "feishu", userId: "ou_a" },
    definition: { id: "unbind_repo", command: "/unbind_repo <url|#>", groupKey: "repo", helpKey: "" } as never,
    raw: "/unbind_repo", args
  };
}

describe("UnbindRepoCommandHandler", () => {
  it("removes a bound repo by url", async () => {
    const repos = await RepositoryStore.load(home);
    const rec = await repos.add({ name: "kuavo", remoteUrl: "https://x/kuavo", defaultBaseBranch: "main" });
    const bindings = await ChatBindingStore.load(home);
    await bindings.addRepository("oc_g", rec.id);
    const handler = new UnbindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(ctx("https://x/kuavo"));
    if (reply.kind !== "text") throw new Error("expected text");
    expect(reply.text).toContain("已取消绑定");
    expect(bindings.get("oc_g")).toBeUndefined();
  });

  it("reports when the repo was not bound", async () => {
    const repos = await RepositoryStore.load(home);
    await repos.add({ name: "kuavo", remoteUrl: "https://x/kuavo", defaultBaseBranch: "main" });
    const bindings = await ChatBindingStore.load(home);
    const handler = new UnbindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(ctx("https://x/kuavo"));
    if (reply.kind !== "text") throw new Error("expected text");
    expect(reply.text).toContain("未在");
  });

  it("reports an unrecognised query", async () => {
    const repos = await RepositoryStore.load(home);
    const bindings = await ChatBindingStore.load(home);
    const handler = new UnbindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(ctx("https://nope"));
    if (reply.kind !== "text") throw new Error("expected text");
    expect(reply.text).toContain("未识别");
  });
});
