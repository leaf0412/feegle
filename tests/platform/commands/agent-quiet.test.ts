import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionStore } from "../../../src/agent/session-store.js";
import { QuietCommandHandler } from "../../../src/platform/commands/agent/quiet-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const def = defineSlashCommand("quiet", "/quiet", "q", "agent", "cmd:/quiet");

function makeContext(sessionKey: string | undefined, args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey,
    sender: { platform: "feishu", userId: "u_1" },
    definition: def,
    raw: "/quiet",
    args
  };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-quiet-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("QuietCommandHandler", () => {
  it("toggles quiet on first call so default behaviour is intuitive", async () => {
    const store = await SessionStore.load(home);
    const handler = new QuietCommandHandler({ sessionStore: store });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("静默");
    expect(store.get("feishu:oc_1:u_1")?.quiet).toBe(true);
  });

  it("explicit 'off' arg disables quiet so users can re-enable progress cards", async () => {
    const store = await SessionStore.load(home);
    await store.getOrCreate("feishu:oc_1:u_1");
    await store.setQuiet("feishu:oc_1:u_1", true);
    const handler = new QuietCommandHandler({ sessionStore: store });
    await handler.execute(makeContext("feishu:oc_1:u_1", "off"));
    expect(store.get("feishu:oc_1:u_1")?.quiet).toBe(false);
  });

  it("no-op when state unchanged so /quiet on idempotent doesn't lie about transitions", async () => {
    const store = await SessionStore.load(home);
    await store.getOrCreate("feishu:oc_1:u_1");
    const handler = new QuietCommandHandler({ sessionStore: store });
    const reply = await handler.execute(makeContext("feishu:oc_1:u_1", "off"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("无变化");
  });
});
