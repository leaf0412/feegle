import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderStore } from "../../src/agent/provider-store.js";

describe("ProviderStore", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-provider-store-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("creates an empty providers.json when the file does not exist", async () => {
    const store = await ProviderStore.load(home);
    expect(store.snapshot()).toEqual({
      schemaVersion: 1,
      providers: [],
      activeKind: null
    });
    const raw = await readFile(join(home, "providers.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({
      schemaVersion: 1,
      providers: [],
      activeKind: null
    });
  });

  it("upserts a provider record and persists it across reloads", async () => {
    const store = await ProviderStore.load(home);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work", approvalPolicy: "on-request" });
    expect(store.snapshot().providers).toEqual([
      { kind: "codex", cwd: "/tmp/codex-work", approvalPolicy: "on-request" }
    ]);
    const reloaded = await ProviderStore.load(home);
    expect(reloaded.snapshot().providers).toEqual([
      { kind: "codex", cwd: "/tmp/codex-work", approvalPolicy: "on-request" }
    ]);
  });

  it("rejects upsert when the kind is already registered", async () => {
    const store = await ProviderStore.load(home);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work" });
    await expect(
      store.upsert({ kind: "codex", cwd: "/tmp/codex-other" })
    ).rejects.toThrow(/provider already registered: codex/);
  });

  it("removes a provider and clears activeKind when it was the active one", async () => {
    const store = await ProviderStore.load(home);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work" });
    await store.setActive("codex");
    const result = await store.remove("codex");
    expect(result).toEqual({ activeCleared: true });
    expect(store.snapshot()).toEqual({ schemaVersion: 1, providers: [], activeKind: null });
  });

  it("removes a non-active provider without touching activeKind", async () => {
    const store = await ProviderStore.load(home);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work" });
    await store.upsert({ kind: "claude_code", cwd: "/tmp/claude-work" });
    await store.setActive("codex");
    const result = await store.remove("claude_code");
    expect(result).toEqual({ activeCleared: false });
    expect(store.snapshot().activeKind).toBe("codex");
  });

  it("rejects setActive for an unregistered kind", async () => {
    const store = await ProviderStore.load(home);
    await expect(store.setActive("codex")).rejects.toThrow(/provider not registered: codex/);
  });

  it("throws a descriptive error when providers.json is corrupt", async () => {
    const filePath = join(home, "providers.json");
    await writeFile(filePath, "{ not json", "utf8");
    await expect(ProviderStore.load(home)).rejects.toThrow(/Invalid providers.json/);
  });

  it("rejects schema violations from the persisted file", async () => {
    const filePath = join(home, "providers.json");
    await writeFile(
      filePath,
      JSON.stringify({ schemaVersion: 1, providers: [{ kind: "unknown" }], activeKind: null }),
      "utf8"
    );
    await expect(ProviderStore.load(home)).rejects.toThrow(/Invalid providers.json/);
  });
});
