import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigStore } from "@infra/app/config-store.js";
import { migrateLegacyProvidersJson } from "@infra/boot/phases/stores-phase.js";

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

    // (a) records landed in config.jsonc — both via in-memory snapshot AND via on-disk reload.
    expect(cfg.get().agent?.providers).toEqual({
      codex: { command: "codex", cwd: "/tmp/codex" },
      claude_code: { command: "claude" }
    });
    expect(cfg.get().agent?.default).toBe("codex");
    const onDisk = await readFile(join(home, "config.jsonc"), "utf8");
    expect(onDisk).toContain('"codex"');
    expect(onDisk).toContain('"claude_code"');
    expect(onDisk).toContain('"default": "codex"');

    // Round-trip: a fresh ConfigStore must load the migrated providers correctly. Catches a
    // regression where the migrator writes valid-shape-but-loader-rejecting JSONC and boot would
    // pass the migration step only to crash on the next ConfigStore.load.
    const reloaded = await ConfigStore.load(home);
    expect(reloaded.get().agent?.providers).toMatchObject({
      codex: { command: "codex", cwd: "/tmp/codex" },
      claude_code: { command: "claude" }
    });
    expect(reloaded.get().agent?.default).toBe("codex");

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

  it("aborts boot loudly on corrupt providers.json — preserves data via .bak, surfaces error", async () => {
    const cfg = await seedConfig(home);
    const providersJsonPath = join(home, "providers.json");
    await writeFile(providersJsonPath, "{ not json", "utf8");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // (1) boot aborts — no silent degradation into "no providers configured"
      await expect(migrateLegacyProvidersJson(home, cfg)).rejects.toThrow(/corrupt providers\.json/i);

      // (2) data preserved as .bak; original file gone so the next boot is a clean no-op
      expect(existsSync(providersJsonPath)).toBe(false);
      const baks = readdirSync(home).filter((f) => f.startsWith("providers.json.bak."));
      expect(baks).toHaveLength(1);

      // (3) operator-visible error names the .bak path so they know where their data went
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(baks[0]!));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
