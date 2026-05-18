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
  findById(id: string): SlashCommandDefinition | undefined;
  findByInput(input: string): SlashCommandDefinition | undefined;
  listCommands(groupKey?: string): SlashCommandDefinition[];
}

export class SlashCommandRegistry implements SlashCommandRegistryReadView {
  private readonly handlers = new Map<string, SlashCommandHandler>();
  private readonly canonicalIds = new Set<string>();
  private readonly definitions = new Map<string, SlashCommandDefinition>();

  register(definition: SlashCommandDefinition, handler?: SlashCommandHandler): this;
  register(handler: SlashCommandHandler): this;
  register(definitionOrHandler: SlashCommandDefinition | SlashCommandHandler, maybeHandler?: SlashCommandHandler): this {
    const definition = isSlashCommandDefinition(definitionOrHandler) ? definitionOrHandler : undefined;
    const handler = isSlashCommandDefinition(definitionOrHandler) ? maybeHandler : definitionOrHandler;
    if (definition) {
      this.registerDefinition(definition);
    }
    if (!handler) {
      return this;
    }
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

  findById(id: string): SlashCommandDefinition | undefined {
    const normalizedId = id.trim();
    const definition = this.definitions.get(normalizedId);
    if (definition) {
      return cloneCommand(definition);
    }
    for (const command of this.definitions.values()) {
      if (command.aliases?.includes(normalizedId)) {
        return cloneCommand(command);
      }
    }
    return undefined;
  }

  findByInput(input: string): SlashCommandDefinition | undefined {
    const normalized = normalizeCommandInput(input);
    for (const command of this.definitions.values()) {
      if (commandMatches(command, normalized)) {
        return cloneCommand(command);
      }
    }
    return undefined;
  }

  listCommands(groupKey?: string): SlashCommandDefinition[] {
    return [...this.definitions.values()]
      .filter((command) => !groupKey || command.groupKey === groupKey)
      .map(cloneCommand);
  }

  private registerDefinition(definition: SlashCommandDefinition): void {
    const existing = this.definitions.get(definition.id);
    if (existing) {
      if (!sameDefinition(existing, definition)) {
        throw new Error(`Slash command definition already registered for id: ${definition.id}`);
      }
      return;
    }
    this.definitions.set(definition.id, cloneCommand(definition));
  }
}

function isSlashCommandDefinition(value: SlashCommandDefinition | SlashCommandHandler): value is SlashCommandDefinition {
  return "command" in value && "description" in value && "groupKey" in value && "action" in value;
}

function commandMatches(command: SlashCommandDefinition, normalizedInput: string): boolean {
  return commandPatterns(command).some((pattern) => inputMatchesPattern(normalizedInput, pattern));
}

function normalizeCommandInput(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function commandPatterns(command: SlashCommandDefinition): string[] {
  const primaryPatterns = command.command.split("|").map((part) => literalCommandPrefix(part));
  const aliasPatterns = command.aliases?.map(literalCommandPrefix) ?? [];
  return [...primaryPatterns, ...aliasPatterns].filter((pattern) => pattern.startsWith("/"));
}

function literalCommandPrefix(command: string): string {
  const tokens = command.trim().split(/\s+/);
  const literals: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("<") || token.startsWith("[") || token.includes("|")) {
      break;
    }
    literals.push(token);
  }
  return literals.join(" ");
}

function inputMatchesPattern(input: string, pattern: string): boolean {
  return input === pattern || input.startsWith(`${pattern} `);
}

function cloneCommand(command: SlashCommandDefinition): SlashCommandDefinition {
  return {
    ...command,
    aliases: command.aliases ? [...command.aliases] : undefined
  };
}

function sameDefinition(left: SlashCommandDefinition, right: SlashCommandDefinition): boolean {
  return JSON.stringify(cloneCommand(left)) === JSON.stringify(cloneCommand(right));
}
