import { describe, expect, it } from "vitest";
import { HelpCommandHandler } from "../../../src/platform/commands/help-command.js";
import {
  SlashCommandRegistry,
  type SlashCommandContext,
  type SlashCommandHandler
} from "../../../src/platform/slash-command-handler.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";

const owner = "ou_owner";
const nonOwner = "ou_other";
const ownerIdentities = new Set([`feishu:${owner}`]);

describe("HelpCommandHandler", () => {
  it("hides owner-only commands from a non-owner browsing the owner-only group", async () => {
    const registry = registryWithCronList(ownerIdentities);
    const reply = await dispatchHelp(registry, nonOwner, "cron");
    expect(reply.kind === "card").toBe(true);
    const serialized = JSON.stringify(reply.kind === "card" ? reply.card : null);
    expect(serialized).not.toContain("/cron list");
    expect(serialized).not.toContain("cron_list");
  });

  it("shows owner-only commands to owners", async () => {
    const registry = registryWithCronList(ownerIdentities);
    const reply = await dispatchHelp(registry, owner, "cron");
    expect(reply.kind === "card").toBe(true);
    const serialized = JSON.stringify(reply.kind === "card" ? reply.card : null);
    expect(serialized).toContain("/cron list");
  });

  it("hides owner-only commands from non-owners in the 'all' view too", async () => {
    const registry = registryWithCronList(ownerIdentities);
    const reply = await dispatchHelp(registry, nonOwner, "all");
    expect(reply.kind === "card").toBe(true);
    const serialized = JSON.stringify(reply.kind === "card" ? reply.card : null);
    expect(serialized).not.toContain("cron_list");
  });
});

function registryWithCronList(identities: ReadonlySet<string>): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  registry.register(defineSlashCommand("help", "/help", "显示帮助", "system", "nav:/help"), new HelpCommandHandler(registry, { ownerIdentities: identities }));
  registry.register(defineSlashCommand("cron_list", "/cron list", "列出所有任务", "cron", "cmd:/cron list"), makeOwnerOnly("cron_list"));
  return registry;
}

function makeOwnerOnly(id: string): SlashCommandHandler {
  return {
    id,
    ownerOnly: true,
    canAccess: (context) => context.sender.userId === owner,
    execute: async () => ({ kind: "text", text: "" })
  };
}

async function dispatchHelp(
  registry: SlashCommandRegistry,
  userId: string,
  args = ""
) {
  const handler = registry.resolve("help");
  if (!handler) throw new Error("help handler not registered");
  const definition = registry.findById("help");
  if (!definition) throw new Error("help definition not registered");
  const context: SlashCommandContext = {
    source: "message",
    chatId: "oc_1",
    messageId: "om_1",
    sender: { platform: "feishu", userId },
    definition,
    raw: "/help",
    args
  };
  return handler.execute(context);
}
