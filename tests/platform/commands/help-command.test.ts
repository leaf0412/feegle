import { describe, expect, it } from "vitest";
import { HelpCommandHandler } from "../../../src/platform/commands/help-command.js";
import {
  SlashCommandRegistry,
  type SlashCommandContext,
  type SlashCommandHandler
} from "../../../src/platform/slash-command-handler.js";
import { defineSlashCommand } from "../../../src/platform/slash-command-catalog.js";

const ownerEmail = "alice@example.com";
const ownerEmails = new Set([ownerEmail]);

describe("HelpCommandHandler", () => {
  it("hides owner-only commands from a non-owner browsing the owner-only group", async () => {
    const registry = registryWithCronList(ownerEmails);
    const reply = await dispatchHelp(registry, "ou_other", "bob@example.com", "cron");
    expect(reply.kind === "card").toBe(true);
    const serialized = JSON.stringify(reply.kind === "card" ? reply.card : null);
    expect(serialized).not.toContain("/cron list");
    expect(serialized).not.toContain("cron_list");
  });

  it("shows owner-only commands to owners", async () => {
    const registry = registryWithCronList(ownerEmails);
    const reply = await dispatchHelp(registry, "ou_owner", ownerEmail, "cron");
    expect(reply.kind === "card").toBe(true);
    const serialized = JSON.stringify(reply.kind === "card" ? reply.card : null);
    expect(serialized).toContain("/cron list");
  });

  it("hides owner-only commands from non-owners in the 'all' view too", async () => {
    const registry = registryWithCronList(ownerEmails);
    const reply = await dispatchHelp(registry, "ou_other", "bob@example.com", "all");
    expect(reply.kind === "card").toBe(true);
    const serialized = JSON.stringify(reply.kind === "card" ? reply.card : null);
    expect(serialized).not.toContain("cron_list");
  });

  it("hides owner-only commands when the viewer has no email resolved", async () => {
    const registry = registryWithCronList(ownerEmails);
    const reply = await dispatchHelp(registry, "ou_unknown", undefined, "all");
    const serialized = JSON.stringify(reply.kind === "card" ? reply.card : null);
    expect(serialized).not.toContain("cron_list");
  });
});

function registryWithCronList(emails: ReadonlySet<string>): SlashCommandRegistry {
  const registry = new SlashCommandRegistry();
  registry.registerCommand(defineSlashCommand("help", "/help", "显示帮助", "system", "nav:/help"), new HelpCommandHandler(registry, { ownerEmails: emails }));
  registry.registerCommand(defineSlashCommand("cron_list", "/cron list", "列出所有任务", "cron", "cmd:/cron list"), makeOwnerOnly("cron_list"));
  return registry;
}

function makeOwnerOnly(id: string): SlashCommandHandler {
  return {
    id,
    ownerOnly: true,
    canAccess: (context) => context.sender.email === ownerEmail,
    execute: async () => ({ kind: "text", text: "" })
  };
}

async function dispatchHelp(
  registry: SlashCommandRegistry,
  userId: string,
  email: string | undefined,
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
    sender: { platform: "feishu", userId, email },
    definition,
    raw: "/help",
    args
  };
  return handler.execute(context);
}
