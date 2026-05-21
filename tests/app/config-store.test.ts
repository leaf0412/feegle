import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigStore } from "../../src/app/config-store.js";

describe("ConfigStore", () => {
  it("creates a null failure target on first load so failures are explicit", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-config-"));

    const store = await ConfigStore.load(home);

    expect(store.get()).toEqual({ schemaVersion: 1, failureTarget: null });
    expect(JSON.parse(await readFile(join(home, "config.json"), "utf8"))).toEqual(store.get());
  });

  it("persists failure target updates atomically through the store API", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-config-"));
    const store = await ConfigStore.load(home);

    await store.setFailureTarget({ platform: "feishu", chatId: "oc_ops" });

    const reloaded = await ConfigStore.load(home);
    expect(reloaded.get().failureTarget).toEqual({ platform: "feishu", chatId: "oc_ops" });
  });

  it("loads config.jsonc before config.json so operators can use comments", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-config-"));
    await writeFile(join(home, "config.json"), JSON.stringify({ schemaVersion: 1, failureTarget: null }));
    await writeFile(
      join(home, "config.jsonc"),
      `{
        // preferred file
        "schemaVersion": 1,
        "failureTarget": null,
        "agent": {
          "default": "codex",
          "providers": {
            "codex": { "command": "codex", "sandbox": "workspace-write" }
          }
        },
        "workspaces": {
          "feegle": "/Users/yb/Desktop/code/personal/feegle",
        },
      }`
    );

    const store = await ConfigStore.load(home);

    expect(store.get().agent?.default).toBe("codex");
    expect(store.get().workspaces?.feegle).toBe("/Users/yb/Desktop/code/personal/feegle");
  });

  it("rejects incompatible schema versions instead of silently migrating", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-config-"));
    await writeFile(join(home, "config.json"), JSON.stringify({ schemaVersion: 2, failureTarget: null }));

    await expect(ConfigStore.load(home)).rejects.toThrow(/config.json/);
  });
});
