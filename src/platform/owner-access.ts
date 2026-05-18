import type { SlashCommandContext } from "./slash-command-handler.js";

export function isOwner(context: SlashCommandContext, ownerIdentities: ReadonlySet<string>): boolean {
  return ownerIdentities.has(`${context.sender.platform}:${context.sender.userId}`);
}
