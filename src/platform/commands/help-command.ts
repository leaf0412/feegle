import type { SlashCommandHandler, SlashCommandReply, SlashCommandRegistryReadView } from "../slash-command-handler.js";
import { buildSlashCommandHelpCard } from "../slash-command-help-card.js";

export class HelpCommandHandler implements SlashCommandHandler {
  readonly id = "help";

  constructor(private readonly registry: SlashCommandRegistryReadView) {}

  async execute(context: { args: string; source: "message" | "card" }): Promise<SlashCommandReply> {
    const groupKey = context.args.trim() || undefined;
    const card = buildSlashCommandHelpCard(this.registry, groupKey);
    return context.source === "card" ? { kind: "card_update", card } : { kind: "card", card };
  }
}
