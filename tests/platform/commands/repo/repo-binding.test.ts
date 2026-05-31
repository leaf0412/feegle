import Database from "better-sqlite3";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { migrate, type RuntimeDb } from "../../../../src/app/runtime-db.js";
import { RepositoryStore } from "../../../../src/resources/repositories/repository-store.js";
import { ChatBindingStore } from "../../../../src/resources/repositories/chat-binding-store.js";
import { bindRepositoryToScope, formatBoundRepoLines } from "../../../../src/platform/commands/repo/repo-binding.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

let db: RuntimeDb;
beforeEach(() => {
  db = makeDb();
});
afterEach(() => {
  db.close();
});

describe("bindRepositoryToScope", () => {
  it("auto-registers an unknown url (no network) and binds it to the scope", async () => {
    const repositoryStore = new RepositoryStore(db);
    const chatBindingStore = new ChatBindingStore(db);

    const { record, binding } = await bindRepositoryToScope(
      { repositoryStore, chatBindingStore },
      "oc_g",
      "https://www.lejuhub.com/pc/kuavo-model-training"
    );

    expect(record.name).toBe("kuavo-model-training");
    expect(binding.repositoryIds).toEqual([record.id]);
    expect(chatBindingStore.get("oc_g")?.repositoryIds).toEqual([record.id]);
  });

  it("reuses an already-registered url instead of creating a duplicate", async () => {
    const repositoryStore = new RepositoryStore(db);
    const existing = await repositoryStore.add({ name: "kuavo", remoteUrl: "https://x/kuavo", defaultBaseBranch: "main" });
    const chatBindingStore = new ChatBindingStore(db);

    const { record } = await bindRepositoryToScope({ repositoryStore, chatBindingStore }, "oc_g", "https://x/kuavo");

    expect(record.id).toBe(existing.id);
    expect(repositoryStore.list().length).toBe(1);
  });
});

describe("formatBoundRepoLines", () => {
  it("renders name (id) per bound repo", async () => {
    const repositoryStore = new RepositoryStore(db);
    const a = await repositoryStore.add({ name: "web", remoteUrl: "https://x/web", defaultBaseBranch: "main" });
    const b = await repositoryStore.add({ name: "api", remoteUrl: "https://x/api", defaultBaseBranch: "main" });

    expect(formatBoundRepoLines(repositoryStore, { repositoryIds: [a.id, b.id] })).toBe(
      `    - web (${a.id})\n    - api (${b.id})`
    );
  });

  it("marks a bound id whose repo record was deleted", () => {
    const repositoryStore = new RepositoryStore(db);

    expect(formatBoundRepoLines(repositoryStore, { repositoryIds: ["gone"] })).toBe("    - gone (已删除)");
  });
});
