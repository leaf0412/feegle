import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply,
  SlashCommandRegistryReadView
} from "../slash-command-handler.js";
import { buildSlashCommandDetailCard } from "../slash-command-help-card.js";

export interface CommandDetailHandlerDeps {
  ownerIdentities?: ReadonlySet<string>;
}

/**
 * Handles nav:/command <id> navigation actions emitted by the help panel.
 * Returns a card_update so the original help message is patched in place.
 */
export class CommandDetailHandler implements SlashCommandHandler {
  readonly id = "__command_detail";

  constructor(
    private readonly registry: SlashCommandRegistryReadView,
    private readonly deps: CommandDetailHandlerDeps = {}
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const targetId = context.args.trim();
    const card = buildSlashCommandDetailCard(targetId, this.registry, {
      viewer: context,
      ownerIdentities: this.deps.ownerIdentities
    });
    return { kind: "card_update", card };
  }
}
