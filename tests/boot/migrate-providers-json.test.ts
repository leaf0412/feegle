import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigStore } from "../../src/app/config-store.js";
import { migrateLegacyProvidersJson } from "../../src/boot/phases/stores-phase.js";

async function seedConfig(home: string, raw = `{
  "schemaVersion": 1,
  "failureTarget": null
}
`): Promise<ConfigStore> {
  await writeFile(join(home, "config.jsonc"), raw, "utf8");
  return ConfigStore.load(home);
}

describe("migrateLegacyProvidersJson", () => {
  let home: string;
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "feegle-migrate-"));
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(async () => {
    warn.mockRestore();
    info.mockRestore();
    await rm(home, { recursive: true, force: true });
  });

  it("no-ops when providers.json doesn't exist so first-run boot stays clean", async () => {
    const cfg = await seedConfig(home);
    await migrateLegacyProvidersJson(home, cfg);
    expect(cfg.get().agent).toBeUndefined();
  });

  it("migrates legacy providers.json into config.jsonc and unlinks the legacy file", async () => {
    const cfg = await seedConfig(home);
    await writeFile(
      join(home, "providers.json"),
      JSON.stringify({
        schemaVersion: 1,
        providers: [
          { kind: "codex", command: "codex", cwd: "/tmp/codex" },
          { kind: "claude_code", command: "claude" }
        ],
        activeKind: "codex"
      })
    );

    await migrateLegacyProvidersJson(home, cfg);

    // (a) records landed in config.jsonc (both via in-memory snapshot and via on-disk reload)
    expect(cfg.get().agent?.providers).toEqual({
      codex: { command: "codex", cwd: "/tmp/codex" },
      claude_code: { command: "claude" }
    });
    expect(cfg.get().agent?.default).toBe("codex");
    const onDisk = await readFile(join(home, "config.jsonc"), "utf8");
    expect(onDisk).toContain('"codex"');
    expect(onDisk).toContain('"claude_code"');
    expect(onDisk).toContain('"default": "codex"');

    // (b) providers.json is gone
    expect(existsSync(join(home, "providers.json"))).toBe(false);
  });

  it("preserves JSONC comments during migration so operator notes survive the upgrade", async () => {
    const cfg = await seedConfig(home, `{
  // Migrated install — do not delete these notes
  "schemaVersion": 1,
  "failureTarget": null,
  "ownerEmails": ["alice@example.com"]
}
`);
    await writeFile(
      join(home, "providers.json"),
      JSON.stringify({
        schemaVersion: 1,
        providers: [{ kind: "codex", command: "codex" }],
        activeKind: "codex"
      })
    );

    await migrateLegacyProvidersJson(home, cfg);

    const onDisk = await readFile(join(home, "config.jsonc"), "utf8");
    expect(onDisk).toContain("// Migrated install — do not delete these notes");
    expect(onDisk).toContain("alice@example.com");
    expect(onDisk).toContain('"codex"');
  });

  it("renames providers.json to .bak when config.jsonc already has agent.providers (no silent overwrite)", async () => {
    const cfg = await seedConfig(home, `{
  "schemaVersion": 1,
  "failureTarget": null,
  "agent": {
    "default": "codex",
    "providers": { "codex": { "command": "codex" } }
  }
}
`);
    await writeFile(
      join(home, "providers.json"),
      JSON.stringify({
        schemaVersion: 1,
        providers: [{ kind: "stale", command: "stale" }],
        activeKind: "stale"
      })
    );

    await migrateLegacyProvidersJson(home, cfg);

    expect(existsSync(join(home, "providers.json"))).toBe(false);
    const baks = readdirSync(home).filter((f) => f.startsWith("providers.json.bak."));
    expect(baks).toHaveLength(1);
    // config.jsonc untouched — still has only codex
    expect(cfg.get().agent?.providers).toEqual({ codex: { command: "codex" } });
  });

  it("renames providers.json to .bak when JSON is corrupt rather than crashing boot", async () => {
    const cfg = await seedConfig(home);
    await writeFile(join(home, "providers.json"), "{ not json", "utf8");

    await migrateLegacyProvidersJson(home, cfg);

    expect(existsSync(join(home, "providers.json"))).toBe(false);
    const baks = readdirSync(home).filter((f) => f.startsWith("providers.json.bak."));
    expect(baks).toHaveLength(1);
  });
});
