import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply,
  SlashCommandRegistryReadView
} from "../slash-command-handler.js";
import { buildSlashCommandHelpCard } from "../slash-command-help-card.js";

export interface HelpCommandHandlerDeps {
  ownerIdentities?: ReadonlySet<string>;
}

export class HelpCommandHandler implements SlashCommandHandler {
  readonly id = "help";

  constructor(
    private readonly registry: SlashCommandRegistryReadView,
    private readonly deps: HelpCommandHandlerDeps = {}
  ) {}

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const groupKey = context.args.trim() || undefined;
    const card = buildSlashCommandHelpCard(this.registry, groupKey, {
      viewer: context,
      ownerIdentities: this.deps.ownerIdentities
    });
    return context.source === "card" ? { kind: "card_update", card } : { kind: "card", card };
  }
}
