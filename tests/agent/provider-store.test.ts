import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderStore } from "../../src/agent/provider-store.js";
import { ConfigStore } from "../../src/infra/app/config-store.js";

async function seedConfig(home: string, jsonc = `{
  "schemaVersion": 1,
  "failureTarget": null
}
`): Promise<ConfigStore> {
  await writeFile(join(home, "config.jsonc"), jsonc, "utf8");
  return ConfigStore.load(home);
}

describe("ProviderStore (config.jsonc view)", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-provider-store-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it("starts empty when config.jsonc has no agent block so first-run behavior is explicit", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    expect(store.snapshot()).toEqual({
      schemaVersion: 1,
      providers: [],
      activeKind: null
    });
  });

  it("upsert writes through to config.jsonc and survives a reload", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work", approvalPolicy: "on-request" });
    expect(store.snapshot().providers).toEqual([
      { kind: "codex", cwd: "/tmp/codex-work", approvalPolicy: "on-request" }
    ]);
    const reloadedCfg = await ConfigStore.load(home);
    const reloadedStore = ProviderStore.fromConfig(reloadedCfg);
    expect(reloadedStore.snapshot().providers).toEqual([
      { kind: "codex", cwd: "/tmp/codex-work", approvalPolicy: "on-request" }
    ]);
  });

  it("rejects upsert when the kind is already registered", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work" });
    await expect(
      store.upsert({ kind: "codex", cwd: "/tmp/codex-other" })
    ).rejects.toThrow(/provider already registered: codex/);
  });

  it("removes a provider and clears activeKind when it was the active one", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work" });
    await store.setActive("codex");
    const result = await store.remove("codex");
    expect(result).toEqual({ activeCleared: true });
    expect(store.snapshot()).toEqual({ schemaVersion: 1, providers: [], activeKind: null });
  });

  it("removes a non-active provider without touching activeKind", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work" });
    await store.upsert({ kind: "claude_code", cwd: "/tmp/claude-work" });
    await store.setActive("codex");
    const result = await store.remove("claude_code");
    expect(result).toEqual({ activeCleared: false });
    expect(store.snapshot().activeKind).toBe("codex");
  });

  it("rejects setActive for an unregistered kind", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    await expect(store.setActive("codex")).rejects.toThrow(/provider not registered: codex/);
  });

  it("accepts a provider record with any kind label so users can name their CLIs freely", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    await store.upsert({ kind: "cc-deepseek", command: "claude-agent-acp" });
    expect(store.snapshot().providers[0]?.kind).toBe("cc-deepseek");
  });

  it("activeKind accepts any string the user chose, not just codex/claude_code", async () => {
    const cfg = await seedConfig(home);
    const store = ProviderStore.fromConfig(cfg);
    await store.upsert({ kind: "gemini", command: "gemini" });
    await store.setActive("gemini");
    expect(store.snapshot().activeKind).toBe("gemini");
  });

  it("writes preserve JSONC comments and sibling fields so config.jsonc stays human-edited", async () => {
    const jsonc = `{
  // operator-facing config — don't strip these comments
  "schemaVersion": 1,
  "failureTarget": null,
  "ownerEmails": ["a@b.com"]
}
`;
    const cfg = await seedConfig(home, jsonc);
    const store = ProviderStore.fromConfig(cfg);
    await store.upsert({ kind: "codex", cwd: "/tmp/codex-work" });
    await store.setActive("codex");

    const onDisk = await readFile(join(home, "config.jsonc"), "utf8");
    expect(onDisk).toContain("// operator-facing config");
    expect(onDisk).toContain("a@b.com");
    expect(onDisk).toContain('"codex"');
    expect(onDisk).toContain('"default": "codex"');
  });
});
