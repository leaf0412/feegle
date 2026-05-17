import { parsePlatformAction, type PlatformAction } from "../platform/platform-action.js";
import { findSlashCommandByInput, type SlashCommandDefinition } from "../platform/slash-command-catalog.js";

export type FeishuCommand =
  | { type: "help"; groupKey?: string }
  | { type: "slash_command"; definition: SlashCommandDefinition; raw: string }
  | { type: "repo_select"; repositoryIds: string[] }
  | { type: "push_repository"; requirementId: string; repositoryId: string }
  | { type: "platform_action"; action: PlatformAction; sessionKey?: string }
  | { type: "unknown"; raw: string };

export function parseFeishuCommand(raw: string): FeishuCommand {
  const trimmed = stripLeadingMentions(raw).trim();
  const parts = trimmed.split(/\s+/);

  if (parts[0] === "/repo" && parts[1] === "select" && parts.length > 2) {
    return { type: "repo_select", repositoryIds: parts.slice(2) };
  }

  if (parts[0] === "/help") {
    return { type: "help", groupKey: parts[1] };
  }

  if (trimmed.startsWith("/")) {
    const definition = findSlashCommandByInput(trimmed);
    if (definition) {
      return { type: "slash_command", definition, raw };
    }
  }

  const cardParts = trimmed.split(":");
  if (cardParts[0] === "card" && cardParts[1] === "push" && cardParts.length === 4) {
    const [, , requirementId, repositoryId] = cardParts;
    if (requirementId && repositoryId) {
      return { type: "push_repository", requirementId, repositoryId };
    }
  }

  return { type: "unknown", raw };
}

function stripLeadingMentions(raw: string): string {
  return raw.replace(/^(\s*@\S+\s+)+/, "");
}

export function parseFeishuCardActionValue(value: unknown): FeishuCommand {
  if (!isRecord(value)) {
    return { type: "unknown", raw: stringifyUnknown(value) };
  }

  if (typeof value.action === "string") {
    const action = parsePlatformAction(value.action);
    if (action.kind !== "unknown") {
      return {
        type: "platform_action",
        action,
        sessionKey: typeof value.session_key === "string" ? value.session_key : undefined
      };
    }
  }

  if (value.action === "push_repository") {
    const requirementId = value.requirementId;
    const repositoryId = value.repositoryId;
    if (typeof requirementId === "string" && typeof repositoryId === "string") {
      return { type: "push_repository", requirementId, repositoryId };
    }
  }

  return { type: "unknown", raw: stringifyUnknown(value) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
