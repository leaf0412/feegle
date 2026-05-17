import type { SlashCommandHandler, SlashCommandReply, SlashCommandRegistryReadView } from "../slash-command-handler.js";
import { buildSlashCommandDetailCard } from "../slash-command-help-card.js";

/**
 * Handles nav:/command <id> navigation actions emitted by the help panel.
 * Returns a card_update so the original help message is patched in place.
 */
export class CommandDetailHandler implements SlashCommandHandler {
  readonly id = "__command_detail";

  constructor(private readonly registry: SlashCommandRegistryReadView) {}

  async execute(context: { args: string }): Promise<SlashCommandReply> {
    const targetId = context.args.trim();
    const card = buildSlashCommandDetailCard(targetId, this.registry);
    return { kind: "card_update", card };
  }
}
