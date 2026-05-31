import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import { ProviderStore } from "../../../src/agent/provider-store.js";
import { ConfigStore } from "@infra/app/config-store.js";
import { AliasStore } from "@platform/commands/alias-store.js";
import { AliasCommandHandler } from "@platform/commands/setup/alias-command.js";
import { ShellCommandHandler } from "@platform/commands/workspace/shell-command.js";
import { defineSlashCommand } from "@platform/slash-command-catalog.js";
import type { SlashCommandContext } from "@platform/slash-command-handler.js";

const def = defineSlashCommand("x", "/x", "x", "agent", "cmd:/x");

function makeContext(args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey: "feishu:oc_1:u_1",
    sender: { platform: "feishu", userId: "u_1", email: "a@b.com" },
    definition: def,
    raw: "/x",
    args
  };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-shell-alias-"));
  await writeFile(join(home, "config.jsonc"), `{
  "schemaVersion": 1,
  "failureTarget": null
}
`, "utf8");
});

async function loadProviderStore(): Promise<ProviderStore> {
  return ProviderStore.fromConfig(await ConfigStore.load(home));
}

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("ShellCommandHandler", () => {
  it("rejects empty command with usage hint so blank /shell doesn't spawn anything", async () => {
    const store = await loadProviderStore();
    const handler = new ShellCommandHandler({
      providers: new AgentProviderRegistry(),
      providerStore: store
    });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("用法");
  });

  it("runs cmd in active provider cwd and reports exit + stdout so users see real result", async () => {
    await writeFile(join(home, "marker.txt"), "found");
    const store = await loadProviderStore();
    await store.upsert({ kind: "codex", cwd: home });
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
    providers.setActive("codex");
    const handler = new ShellCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext("ls"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("marker.txt");
    expect(reply.text).toContain(`cwd: ${home}`);
    expect(reply.text).toContain("exit: 0");
  });

  it("requires active provider so /shell does not silently pick a wrong cwd", async () => {
    const store = await loadProviderStore();
    const handler = new ShellCommandHandler({
      providers: new AgentProviderRegistry(),
      providerStore: store
    });
    const reply = await handler.execute(makeContext("ls"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("未激活 provider");
  });
});

describe("AliasCommandHandler", () => {
  it("lists empty with usage hint so newcomers see how to add one", async () => {
    const store = await AliasStore.load(home);
    const handler = new AliasCommandHandler({ aliasStore: store });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("还没有");
    expect(reply.text).toContain("/alias add");
  });

  it("/alias add <k>=<v> persists so /alias list shows it back after a restart", async () => {
    const store = await AliasStore.load(home);
    const handler = new AliasCommandHandler({ aliasStore: store });
    await handler.execute(makeContext("add ll=/list"));
    const reloaded = await AliasStore.load(home);
    expect(reloaded.list()).toEqual([{ alias: "ll", target: "/list" }]);
  });

  it("/alias remove returns not-found message for unknown alias so users know nothing changed", async () => {
    const store = await AliasStore.load(home);
    const handler = new AliasCommandHandler({ aliasStore: store });
    const reply = await handler.execute(makeContext("remove unknown"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("未找到");
  });

  it("rejects bad syntax with usage hint so typos don't silently no-op", async () => {
    const store = await AliasStore.load(home);
    const handler = new AliasCommandHandler({ aliasStore: store });
    const reply = await handler.execute(makeContext("wat does this mean"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("用法");
  });
});
