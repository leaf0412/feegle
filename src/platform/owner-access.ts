import type { SlashCommandContext } from "./slash-command-handler.js";

export function isOwner(context: SlashCommandContext, ownerEmails: ReadonlySet<string>): boolean {
  const email = context.sender.email;
  if (email === undefined || email === "") {
    return false;
  }
  return ownerEmails.has(email.toLowerCase());
}

export function normalizeOwnerEmail(value: string): string {
  return value.trim().toLowerCase();
}
