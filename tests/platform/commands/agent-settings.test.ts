import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import { ProviderStore } from "../../../src/agent/provider-store.js";
import { AllowCommandHandler } from "../../../src/platform/commands/agent/allow-command.js";
import { MemoryCommandHandler } from "../../../src/platform/commands/agent/memory-command.js";
import { ModeCommandHandler } from "../../../src/platform/commands/agent/mode-command.js";
import { ReasoningCommandHandler } from "../../../src/platform/commands/agent/reasoning-command.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";
import type { SlashCommandContext } from "../../../src/platform/slash-command-handler.js";

const def = defineSlashCommand("placeholder", "/placeholder", "x", "agent", "cmd:/placeholder");

function makeContext(args = ""): SlashCommandContext {
  return {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sessionKey: "feishu:oc_1:u_1",
    sender: { platform: "feishu", userId: "u_1" },
    definition: def,
    raw: "/placeholder",
    args
  };
}

async function activeCodex(home: string) {
  const store = await ProviderStore.load(home);
  await store.upsert({ kind: "codex", cwd: home });
  const providers = new AgentProviderRegistry();
  providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
  providers.setActive("codex");
  return { store, providers };
}

async function activeClaude(home: string) {
  const store = await ProviderStore.load(home);
  await store.upsert({ kind: "claude_code", cwd: home });
  const providers = new AgentProviderRegistry();
  providers.register({ kind: "claude_code", displayName: "Claude Code", buildAgent: () => ({} as never) });
  providers.setActive("claude_code");
  return { store, providers };
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "feegle-agent-settings-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("ReasoningCommandHandler", () => {
  it("rejects non-codex agents so the message accurately reflects capability", async () => {
    const { store, providers } = await activeClaude(home);
    const handler = new ReasoningCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext("high"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("不支持");
  });

  it("persists reasoningEffort on codex so the next cli run uses it", async () => {
    const { store, providers } = await activeCodex(home);
    const handler = new ReasoningCommandHandler({ providers, providerStore: store });
    await handler.execute(makeContext("high"));
    expect(store.snapshot().providers.find((p) => p.kind === "codex")?.reasoningEffort).toBe("high");
  });

  it("rejects invalid effort with explicit options list so users discover valid values", async () => {
    const { store, providers } = await activeCodex(home);
    const handler = new ReasoningCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext("ultra"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("low");
    expect(reply.text).toContain("medium");
    expect(reply.text).toContain("high");
  });
});

describe("ModeCommandHandler", () => {
  it("rejects non-claude agents so codex users see a clear unsupported message", async () => {
    const { store, providers } = await activeCodex(home);
    const handler = new ModeCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext("plan"));
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("不支持");
  });

  it("persists permission mode on claude_code so the next cli run uses it", async () => {
    const { store, providers } = await activeClaude(home);
    const handler = new ModeCommandHandler({ providers, providerStore: store });
    await handler.execute(makeContext("acceptEdits"));
    expect(store.snapshot().providers.find((p) => p.kind === "claude_code")?.mode).toBe("acceptEdits");
  });
});

describe("MemoryCommandHandler", () => {
  it("renders project + global memory file paths for claude_code so user knows where to edit", async () => {
    const { store, providers } = await activeClaude(home);
    const handler = new MemoryCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("CLAUDE.md");
    expect(reply.text).toContain(".claude");
  });

  it("renders project + global memory file paths for codex so users see AGENTS.md", async () => {
    const { store, providers } = await activeCodex(home);
    const handler = new MemoryCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("AGENTS.md");
    expect(reply.text).toContain(".codex");
  });
});

describe("AllowCommandHandler", () => {
  it("lists empty allowedTools so users see they're using CLI defaults", async () => {
    const { store, providers } = await activeClaude(home);
    const handler = new AllowCommandHandler({ providers, providerStore: store });
    const reply = await handler.execute(makeContext());
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("空");
  });

  it("adds tools and dedupes so /allow Bash Bash adds Bash once", async () => {
    const { store, providers } = await activeClaude(home);
    const handler = new AllowCommandHandler({ providers, providerStore: store });
    await handler.execute(makeContext("Bash,Bash,Edit"));
    const tools = store.snapshot().providers.find((p) => p.kind === "claude_code")?.allowedTools;
    expect(tools).toEqual(["Bash", "Edit"]);
  });

  it("/allow clear wipes the list so users can reset back to defaults", async () => {
    const { store, providers } = await activeClaude(home);
    await store.updateSettings("claude_code", { allowedTools: ["Bash", "Edit"] });
    const handler = new AllowCommandHandler({ providers, providerStore: store });
    await handler.execute(makeContext("clear"));
    const tools = store.snapshot().providers.find((p) => p.kind === "claude_code")?.allowedTools;
    expect(tools).toEqual([]);
  });
});
