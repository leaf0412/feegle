import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, type RuntimeDb } from "@infra/app/runtime-db.js";
import { ChatBindingStore } from "@resources/repositories/chat-binding-store.js";

function makeDb(): RuntimeDb {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

let db: RuntimeDb;
beforeEach(() => { db = makeDb(); });
afterEach(() => { db.close(); });

describe("ChatBindingStore repositories", () => {
  it("addRepository creates a binding and unions ids without duplicates", async () => {
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "repo_1");
    await store.addRepository("oc_g", "repo_2");
    await store.addRepository("oc_g", "repo_1"); // dup
    expect(store.get("oc_g")?.repositoryIds).toEqual(["repo_1", "repo_2"]);
  });

  it("addRepository preserves insertion order across multiple calls", async () => {
    // Regression: ordinals are assigned via max(ordinal)+1. If a previous implementation
    // reset ordinals or relied on rowid, this test would catch out-of-order reads.
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "alpha");
    await store.addRepository("oc_g", "beta");
    await store.addRepository("oc_g", "gamma");
    expect(store.get("oc_g")?.repositoryIds).toEqual(["alpha", "beta", "gamma"]);
  });

  it("removeRepository drops an id and deletes the binding when it becomes empty", async () => {
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "repo_1");
    const r1 = await store.removeRepository("oc_g", "repo_1");
    expect(r1.removed).toBe(true);
    expect(r1.binding).toBeUndefined();
    expect(store.get("oc_g")).toBeUndefined();
  });

  it("removeRepository reports removed=false when the id is not bound", async () => {
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "repo_1");
    const r = await store.removeRepository("oc_g", "repo_2");
    expect(r.removed).toBe(false);
    expect(store.get("oc_g")?.repositoryIds).toEqual(["repo_1"]);
  });

  it("removeRepository keeps the binding when other ids remain", async () => {
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "repo_1");
    await store.addRepository("oc_g", "repo_2");
    const r = await store.removeRepository("oc_g", "repo_1");
    expect(r.removed).toBe(true);
    expect(r.binding?.repositoryIds).toEqual(["repo_2"]);
  });

  it("upsert replaces the entire repository list when explicit ids are supplied", async () => {
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "old_1");
    await store.addRepository("oc_g", "old_2");
    const binding = await store.upsert({ chatId: "oc_g", repositoryIds: ["new_1"] });
    expect(binding.repositoryIds).toEqual(["new_1"]);
    expect(store.get("oc_g")?.repositoryIds).toEqual(["new_1"]);
  });

  it("upsert with no repositoryIds preserves the existing list", async () => {
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "repo_1");
    await store.upsert({ chatId: "oc_g" });
    expect(store.get("oc_g")?.repositoryIds).toEqual(["repo_1"]);
  });

  it("clear deletes both the header AND its repositories via FK cascade", async () => {
    // Regression for `pragma foreign_keys = ON` — without it, the cascade is silently
    // a no-op and `chat_binding_repositories` would accumulate orphan rows under the
    // same scope_key forever, only surfacing as subtle bugs after a re-bind.
    const store = new ChatBindingStore(db);
    await store.addRepository("oc_g", "repo_1");
    await store.addRepository("oc_g", "repo_2");

    const removed = await store.clear("oc_g");
    expect(removed).toBe(true);

    expect(store.get("oc_g")).toBeUndefined();
    const repoRow = db
      .prepare("select count(*) as n from chat_binding_repositories where scope_key = ?")
      .get("oc_g") as { n: number };
    expect(repoRow.n).toBe(0);
  });

  it("clear returns false when nothing was bound", async () => {
    const store = new ChatBindingStore(db);
    expect(await store.clear("oc_unknown")).toBe(false);
  });

  it("addRepository persists a stable updatedAt from the injected clock", async () => {
    // Tests intent: the stored updatedAt must come from the supplied clock, not Date.now()
    // — required for deterministic snapshots downstream.
    const fixed = new Date("2026-01-15T10:00:00.000Z");
    const store = new ChatBindingStore(db, () => fixed);
    await store.addRepository("oc_g", "repo_1");
    expect(store.get("oc_g")?.updatedAt).toBe(fixed.toISOString());
  });
});
