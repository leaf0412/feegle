import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import { ProviderStore } from "../../../src/agent/provider-store.js";
import { ModelCommandHandler } from "../../../src/platform/commands/agent/model-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const def = defineSlashCommand("model", "/model", "m", "agent", "nav:/model");

function makeContext(args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey: "feishu:oc_1:u_1",
    sender: { platform: "feishu", userId: "u_1" },
    definition: def,
    raw: "/model",
    args
  };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-model-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("ModelCommandHandler", () => {
  it("tells the user to activate a provider when none is active so /model gives actionable next step", async () => {
    const store = await ProviderStore.load(home);
    const handler = new ModelCommandHandler({ providers: new AgentProviderRegistry(), providerStore: store });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("/provider use");
  });

  it("shows current model + usage hint when called without args so users can introspect first", async () => {
    const store = await ProviderStore.load(home);
    await store.upsert({ kind: "codex", cwd: home, model: "gpt-5.3-codex" });
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
    providers.setActive("codex");
    const handler = new ModelCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("gpt-5.3-codex");
    expect(reply.text).toContain("/model <name>");
  });

  it("persists model setting on ProviderStore so the next cli run gets the new model", async () => {
    const store = await ProviderStore.load(home);
    await store.upsert({ kind: "codex", cwd: home });
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
    providers.setActive("codex");
    const handler = new ModelCommandHandler({ providers, providerStore: store });
    await handler.execute(makeContext("openai/gpt-5.4"));
    const record = store.snapshot().providers.find((p) => p.kind === "codex");
    expect(record?.model).toBe("openai/gpt-5.4");
  });
});
