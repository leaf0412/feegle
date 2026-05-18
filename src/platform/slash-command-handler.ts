import type { PlatformCard } from "./platform-card.js";
import type { SlashCommandDefinition } from "./slash-command-catalog.js";

export type SlashCommandInvocationSource = "message" | "card";

export interface SlashCommandContext {
  source: SlashCommandInvocationSource;
  chatId: string;
  messageId: string;
  sender: { platform: "feishu"; userId: string };
  definition: SlashCommandDefinition;
  raw: string;
  args: string;
}

export type SlashCommandReply =
  | { kind: "text"; text: string }
  | { kind: "card"; card: PlatformCard }
  | { kind: "card_update"; card: PlatformCard };

export interface SlashCommandHandler {
  readonly id: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly ownerOnly?: boolean;
  canAccess?(context: SlashCommandContext): boolean;
  execute(context: SlashCommandContext): Promise<SlashCommandReply>;
}

export interface SlashCommandRegistryReadView {
  isImplemented(id: string): boolean;
  implementedIds(): ReadonlySet<string>;
  resolve(id: string): SlashCommandHandler | undefined;
}

export class SlashCommandRegistry implements SlashCommandRegistryReadView {
  private readonly handlers = new Map<string, SlashCommandHandler>();
  private readonly canonicalIds = new Set<string>();

  register(handler: SlashCommandHandler): this {
    if (this.handlers.has(handler.id)) {
      throw new Error(`Slash command handler already registered for id: ${handler.id}`);
    }
    this.handlers.set(handler.id, handler);
    this.canonicalIds.add(handler.id);
    for (const alias of handler.aliases ?? []) {
      if (this.handlers.has(alias)) {
        throw new Error(`Slash command alias collision: ${alias}`);
      }
      this.handlers.set(alias, handler);
    }
    return this;
  }

  resolve(id: string): SlashCommandHandler | undefined {
    return this.handlers.get(id);
  }

  isImplemented(id: string): boolean {
    return this.canonicalIds.has(id);
  }

  implementedIds(): ReadonlySet<string> {
    return this.canonicalIds;
  }
}
