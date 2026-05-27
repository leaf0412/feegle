import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigStore } from "../../src/app/config-store.js";

async function withHome(jsonc: string, fn: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "feegle-cfg-"));
  try {
    await writeFile(join(home, "config.jsonc"), jsonc, "utf8");
    await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

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

describe("ConfigStore feishu/gitlab/ownerEmails", () => {
  it("parses feishu, gitlab and ownerEmails so config.jsonc is the single source of truth", async () => {
    await withHome(
      JSON.stringify({
        schemaVersion: 1,
        failureTarget: null,
        ownerEmails: ["a@b.com"],
        feishu: {
          appId: "cli_x", appSecret: "sec",
          enableInteractiveCards: true, allowFrom: "*", allowChat: "*",
          groupOnly: false, groupReplyAll: false, shareSessionInChannel: false,
          threadIsolation: false, replyToTrigger: true, progressStyle: "card",
          reactionEmoji: "OnIt"
        },
        gitlab: { token: "glpat", host: "www.lejuhub.com", workspace: "/tmp/repos" }
      }),
      async (home) => {
        const store = await ConfigStore.load(home);
        const c = store.get();
        expect(c.feishu?.appId).toBe("cli_x");
        expect(c.gitlab?.host).toBe("www.lejuhub.com");
        expect(c.ownerEmails).toEqual(["a@b.com"]);
      }
    );
  });

  it("rejects a feishu section missing a required behavior toggle (no hidden code default)", async () => {
    await withHome(
      JSON.stringify({
        schemaVersion: 1, failureTarget: null,
        feishu: { appId: "cli_x", appSecret: "sec" } // 缺必填开关
      }),
      async (home) => {
        await expect(ConfigStore.load(home)).rejects.toThrow(/Invalid config/);
      }
    );
  });

  it("rejects a gitlab section missing host (token/host/workspace all required when present)", async () => {
    await withHome(
      JSON.stringify({
        schemaVersion: 1, failureTarget: null,
        gitlab: { token: "glpat", workspace: "/tmp/repos" } // 缺 host
      }),
      async (home) => {
        await expect(ConfigStore.load(home)).rejects.toThrow(/Invalid config/);
      }
    );
  });

  it("get() returns deep copies so callers cannot mutate stored config", async () => {
    await withHome(
      JSON.stringify({
        schemaVersion: 1, failureTarget: null, ownerEmails: ["a@b.com"]
      }),
      async (home) => {
        const store = await ConfigStore.load(home);
        store.get().ownerEmails!.push("x@y.com");
        expect(store.get().ownerEmails).toEqual(["a@b.com"]);
      }
    );
  });
});

describe("ConfigStore environment-variable interpolation", () => {
  const fullFeishu = (appId: string, appSecret: string) => ({
    appId, appSecret,
    enableInteractiveCards: true, allowFrom: "*", allowChat: "*",
    groupOnly: false, groupReplyAll: false, shareSessionInChannel: false,
    threadIsolation: false, replyToTrigger: true, progressStyle: "card",
    reactionEmoji: "OnIt"
  });

  it("resolves {env:VAR} references from the environment so secrets stay out of config.jsonc", async () => {
    await withHome(
      JSON.stringify({
        schemaVersion: 1, failureTarget: null,
        feishu: fullFeishu("{env:FEISHU_APP_ID}", "{env:FEISHU_APP_SECRET}")
      }),
      async (home) => {
        const store = await ConfigStore.load(home, {
          FEISHU_APP_ID: "cli_real",
          FEISHU_APP_SECRET: "secret_real"
        });
        expect(store.get().feishu?.appId).toBe("cli_real");
        expect(store.get().feishu?.appSecret).toBe("secret_real");
      }
    );
  });

  it("throws a clear error when a referenced environment variable is unset (no silent fallback)", async () => {
    await withHome(
      JSON.stringify({
        schemaVersion: 1, failureTarget: null,
        feishu: fullFeishu("{env:FEISHU_APP_ID}", "{env:FEISHU_APP_SECRET}")
      }),
      async (home) => {
        await expect(
          ConfigStore.load(home, { FEISHU_APP_ID: "cli_real" }) // FEISHU_APP_SECRET missing
        ).rejects.toThrow(/FEISHU_APP_SECRET/);
      }
    );
  });

  it("setFailureTarget edits only failureTarget — preserves other fields, {env:...} tokens and comments", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-cfg-"));
    try {
      await writeFile(
        join(home, "config.jsonc"),
        `{
          // operator config
          "schemaVersion": 1,
          "failureTarget": null,
          "ownerEmails": ["a@b.com"],
          "feishu": ${JSON.stringify(fullFeishu("{env:FEISHU_APP_ID}", "{env:FEISHU_APP_SECRET}"))}
        }`,
        "utf8"
      );
      const env = { FEISHU_APP_ID: "cli_real", FEISHU_APP_SECRET: "secret_real" };
      const store = await ConfigStore.load(home, env);

      await store.setFailureTarget({ platform: "feishu", chatId: "oc_ops" });

      const onDisk = await readFile(join(home, "config.jsonc"), "utf8");
      expect(onDisk).toContain("{env:FEISHU_APP_SECRET}"); // token preserved, NOT resolved to plaintext
      expect(onDisk).toContain("a@b.com"); // other fields not wiped
      expect(onDisk).toContain("operator config"); // comment preserved
      expect(onDisk).toContain("oc_ops"); // failureTarget written

      const reloaded = await ConfigStore.load(home, env);
      expect(reloaded.get().failureTarget).toEqual({ platform: "feishu", chatId: "oc_ops" });
      expect(reloaded.get().feishu?.appSecret).toBe("secret_real");
      expect(reloaded.get().ownerEmails).toEqual(["a@b.com"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
