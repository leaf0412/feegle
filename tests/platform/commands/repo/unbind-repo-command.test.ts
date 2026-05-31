import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, type RuntimeDb } from "../../../../src/app/runtime-db.js";
import { RepositoryStore } from "../../../../src/resources/repositories/repository-store.js";
import { ChatBindingStore } from "../../../../src/resources/repositories/chat-binding-store.js";
import { UnbindRepoCommandHandler } from "../../../../src/platform/commands/repo/unbind-repo-command.js";
import type { SlashCommandContext } from "../../../../src/platform/slash-command-handler.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

let home: string;
let db: RuntimeDb;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-unbind-"));
  db = makeDb();
});
afterEach(async () => {
  db.close();
  await rm(home, { recursive: true, force: true });
});

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
    const repos = new RepositoryStore(db);
    const rec = await repos.add({ name: "kuavo", remoteUrl: "https://x/kuavo", defaultBaseBranch: "main" });
    const bindings = new ChatBindingStore(db);
    await bindings.addRepository("oc_g", rec.id);
    const handler = new UnbindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(ctx("https://x/kuavo"));
    if (reply.kind !== "text") throw new Error("expected text");
    expect(reply.text).toContain("已取消绑定");
    expect(bindings.get("oc_g")).toBeUndefined();
  });

  it("reports when the repo was not bound", async () => {
    const repos = new RepositoryStore(db);
    await repos.add({ name: "kuavo", remoteUrl: "https://x/kuavo", defaultBaseBranch: "main" });
    const bindings = new ChatBindingStore(db);
    const handler = new UnbindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(ctx("https://x/kuavo"));
    if (reply.kind !== "text") throw new Error("expected text");
    expect(reply.text).toContain("未在");
  });

  it("reports an unrecognised query", async () => {
    const repos = new RepositoryStore(db);
    const bindings = new ChatBindingStore(db);
    const handler = new UnbindRepoCommandHandler({ repositoryStore: repos, chatBindingStore: bindings });
    const reply = await handler.execute(ctx("https://nope"));
    if (reply.kind !== "text") throw new Error("expected text");
    expect(reply.text).toContain("未识别");
  });
});
