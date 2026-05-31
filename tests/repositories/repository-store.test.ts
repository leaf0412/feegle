import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, type RuntimeDb } from "../../src/app/runtime-db.js";
import { RepositoryStore } from "../../src/resources/repositories/repository-store.js";

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

describe("RepositoryStore", () => {
  it("starts empty on a fresh DB so a first boot has no repositories", () => {
    const store = new RepositoryStore(db);
    expect(store.list()).toEqual([]);
  });

  it("add assigns monotonically increasing ids so removal+addition does not collide", async () => {
    const store = new RepositoryStore(db);
    const first = await store.add({ name: "repo-a", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const second = await store.add({ name: "repo-b", remoteUrl: "https://x/b", defaultBaseBranch: "main" });
    expect(first.id).toBe("repo_1");
    expect(second.id).toBe("repo_2");
    await store.remove(first.id);
    const third = await store.add({ name: "repo-c", remoteUrl: "https://x/c", defaultBaseBranch: "main" });
    // The counter is durable: removing repo_1 must NOT let the next add reuse it.
    expect(third.id).toBe("repo_3");
  });

  it("findByQuery matches by #index, id, name, and remote url so users can lookup naturally", async () => {
    const store = new RepositoryStore(db);
    const repo = await store.add({ name: "feegle", remoteUrl: "https://github.com/x/y", defaultBaseBranch: "main" });
    expect(store.findByQuery("#1")?.id).toBe(repo.id);
    expect(store.findByQuery(repo.id)?.id).toBe(repo.id);
    expect(store.findByQuery("feegle")?.id).toBe(repo.id);
    expect(store.findByQuery("https://github.com/x/y")?.id).toBe(repo.id);
  });

  it("findByQuery #index resolves to insertion order even after a middle removal", async () => {
    const store = new RepositoryStore(db);
    await store.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const beta = await store.add({ name: "beta", remoteUrl: "https://x/b", defaultBaseBranch: "main" });
    const gamma = await store.add({ name: "gamma", remoteUrl: "https://x/c", defaultBaseBranch: "main" });
    // Remove the first; #1 must now resolve to the next surviving repo in
    // insertion order (beta), and #2 to gamma — proving list() orders by the
    // numeric id suffix, not by some unstable row order.
    await store.remove("repo_1");
    expect(store.findByQuery("#1")?.id).toBe(beta.id);
    expect(store.findByQuery("#2")?.id).toBe(gamma.id);
    expect(store.findByQuery("#3")).toBeUndefined();
  });

  it("get/findByUrl miss returns undefined so callers can report not-found", async () => {
    const store = new RepositoryStore(db);
    expect(store.get("repo_99")).toBeUndefined();
    expect(store.findByUrl("https://nope")).toBeUndefined();
    expect(store.findByQuery("nope")).toBeUndefined();
  });

  it("update mutates the named fields and bumps updatedAt while keeping id/createdAt", async () => {
    const clock = makeClock(["2026-01-01T00:00:00.000Z", "2026-02-02T00:00:00.000Z"]);
    const store = new RepositoryStore(db, { clock });
    const repo = await store.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const updated = await store.update(repo.id, { name: "alpha2", defaultBaseBranch: "develop" });
    expect(updated.id).toBe(repo.id);
    expect(updated.name).toBe("alpha2");
    expect(updated.defaultBaseBranch).toBe("develop");
    expect(updated.remoteUrl).toBe("https://x/a");
    expect(updated.createdAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.updatedAt.toISOString()).toBe("2026-02-02T00:00:00.000Z");
  });

  it("update on a missing id throws so callers cannot silently no-op", async () => {
    const store = new RepositoryStore(db);
    await expect(store.update("repo_404", { name: "x" })).rejects.toThrow(/repository not found: repo_404/);
  });

  it("remove returns false for a missing id and true after deleting an existing repo", async () => {
    const store = new RepositoryStore(db);
    expect(await store.remove("repo_404")).toBe(false);
    const repo = await store.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    expect(await store.remove(repo.id)).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it("persists across reconstruction so registered repos survive a restart", async () => {
    const store = new RepositoryStore(db);
    await store.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const reloaded = new RepositoryStore(db);
    expect(reloaded.list().map((r) => r.name)).toEqual(["alpha"]);
  });
});

function makeClock(iso: string[]): () => Date {
  let i = 0;
  return () => new Date(iso[Math.min(i++, iso.length - 1)]!);
}
