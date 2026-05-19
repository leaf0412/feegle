import type { PlatformCard } from "./platform-card.js";
import type { SlashCommandDefinition } from "./slash-command-catalog.js";

export type SlashCommandInvocationSource = "message" | "card";

export interface SlashCommandContext {
  source: SlashCommandInvocationSource;
  chatId: string;
  messageId: string;
  sessionKey?: string;
  sender: { platform: "feishu"; userId: string; email?: string };
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
  private frozen = false;

  declarePlanned(definition: SlashCommandDefinition): this {
    this.guardWritable();
    this.guardIdAvailable(definition.id);
    this.definitions.set(definition.id, cloneCommand(definition));
    return this;
  }

  registerCommand(definition: SlashCommandDefinition, handler: SlashCommandHandler): this {
    this.guardWritable();
    if (definition.id !== handler.id) {
      throw new Error(`definition id (${definition.id}) and handler id (${handler.id}) must match`);
    }
    this.guardIdAvailable(definition.id);
    this.definitions.set(definition.id, cloneCommand(definition));
    this.attachHandler(handler);
    return this;
  }

  registerInternalHandler(handler: SlashCommandHandler): this {
    this.guardWritable();
    this.guardIdAvailable(handler.id);
    this.attachHandler(handler);
    return this;
  }

  freeze(): this {
    this.frozen = true;
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

  private guardWritable(): void {
    if (this.frozen) {
      throw new Error("Slash command registry is frozen; register all commands before boot completes");
    }
  }

  private guardIdAvailable(id: string): void {
    if (this.definitions.has(id) || this.handlers.has(id) || this.canonicalIds.has(id)) {
      throw new Error(`Slash command id already registered: ${id}`);
    }
  }

  private attachHandler(handler: SlashCommandHandler): void {
    this.handlers.set(handler.id, handler);
    this.canonicalIds.add(handler.id);
    for (const alias of handler.aliases ?? []) {
      if (this.handlers.has(alias)) {
        throw new Error(`Slash command alias collision: ${alias}`);
      }
      this.handlers.set(alias, handler);
    }
  }
}

export function extractSlashCommandArgs(raw: string, command: string): string {
  const literalPrefix = command.split(/[<\[|]/, 1)[0]?.trim() ?? "";
  if (literalPrefix !== "" && raw.startsWith(literalPrefix)) {
    return raw.slice(literalPrefix.length).trim();
  }
  return raw.trim();
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
