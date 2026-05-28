import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChatBindingStore } from "../../src/repositories/chat-binding-store.js";

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "feegle-cbs-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe("ChatBindingStore repositories", () => {
  it("addRepository creates a binding and unions ids without duplicates", async () => {
    const store = await ChatBindingStore.load(home);
    await store.addRepository("oc_g", "repo_1");
    await store.addRepository("oc_g", "repo_2");
    await store.addRepository("oc_g", "repo_1"); // dup
    expect(store.get("oc_g")?.repositoryIds).toEqual(["repo_1", "repo_2"]);
  });

  it("removeRepository drops an id and deletes the binding when it becomes empty", async () => {
    const store = await ChatBindingStore.load(home);
    await store.addRepository("oc_g", "repo_1");
    const r1 = await store.removeRepository("oc_g", "repo_1");
    expect(r1.removed).toBe(true);
    expect(store.get("oc_g")).toBeUndefined();
  });

  it("removeRepository reports removed=false when the id is not bound", async () => {
    const store = await ChatBindingStore.load(home);
    await store.addRepository("oc_g", "repo_1");
    const r = await store.removeRepository("oc_g", "repo_2");
    expect(r.removed).toBe(false);
    expect(store.get("oc_g")?.repositoryIds).toEqual(["repo_1"]);
  });

  it("reads a legacy file that still has branch/baseBranch, keeping only repositoryIds", async () => {
    await writeFile(
      join(home, "chat-bindings.json"),
      JSON.stringify({ schemaVersion: 1, bindings: [{ chatId: "oc_g", branch: "x", baseBranch: "main", repositoryIds: ["repo_1"], updatedAt: "t" }] }),
      "utf8"
    );
    const store = await ChatBindingStore.load(home);
    expect(store.get("oc_g")?.repositoryIds).toEqual(["repo_1"]);
    expect((store.get("oc_g") as Record<string, unknown>).branch).toBeUndefined();
  });
});
