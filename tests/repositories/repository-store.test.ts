import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RepositoryStore } from "../../src/repositories/repository-store.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-repo-store-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("RepositoryStore", () => {
  it("creates repositories.json on first load so a fresh feegle home boots cleanly", async () => {
    const store = await RepositoryStore.load(home);
    expect(store.list()).toEqual([]);
  });

  it("add assigns monotonically increasing ids so removal+addition does not collide", async () => {
    const store = await RepositoryStore.load(home);
    const first = await store.add({ name: "repo-a", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const second = await store.add({ name: "repo-b", remoteUrl: "https://x/b", defaultBaseBranch: "main" });
    expect(first.id).toBe("repo_1");
    expect(second.id).toBe("repo_2");
    await store.remove(first.id);
    const third = await store.add({ name: "repo-c", remoteUrl: "https://x/c", defaultBaseBranch: "main" });
    expect(third.id).toBe("repo_3");
  });

  it("findByQuery matches by #index, id, name, and remote url so users can lookup naturally", async () => {
    const store = await RepositoryStore.load(home);
    const repo = await store.add({ name: "feegle", remoteUrl: "https://github.com/x/y", defaultBaseBranch: "main" });
    expect(store.findByQuery("#1")?.id).toBe(repo.id);
    expect(store.findByQuery(repo.id)?.id).toBe(repo.id);
    expect(store.findByQuery("feegle")?.id).toBe(repo.id);
    expect(store.findByQuery("https://github.com/x/y")?.id).toBe(repo.id);
  });

  it("persists across reloads so registered repos survive a restart", async () => {
    const store = await RepositoryStore.load(home);
    await store.add({ name: "alpha", remoteUrl: "https://x/a", defaultBaseBranch: "main" });
    const reloaded = await RepositoryStore.load(home);
    expect(reloaded.list().map((r) => r.name)).toEqual(["alpha"]);
  });
});
