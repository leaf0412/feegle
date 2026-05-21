import { parsePlatformAction, type PlatformAction } from "../platform/platform-action.js";
import type { SlashCommandDefinition } from "../platform/slash-command-catalog.js";

export type FeishuCommand =
  | { type: "help"; groupKey?: string }
  | { type: "slash_input"; raw: string }
  | { type: "slash_command"; definition: SlashCommandDefinition; raw: string }
  | { type: "chat"; raw: string }
  | { type: "repo_select"; repositoryIds: string[] }
  | { type: "push_repository"; requirementId: string; repositoryId: string }
  | {
      type: "workbench_directory_submit";
      interactionId: string;
      provider?: string;
      workspacePath?: string;
      manualPath?: string;
    }
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
    return { type: "slash_input", raw: trimmed };
  }

  const cardParts = trimmed.split(":");
  if (cardParts[0] === "card") {
    if (cardParts[1] === "push" && cardParts.length === 4) {
      const [, , requirementId, repositoryId] = cardParts;
      if (requirementId && repositoryId) {
        return { type: "push_repository", requirementId, repositoryId };
      }
    }
    return { type: "unknown", raw };
  }

  return { type: "chat", raw };
}

function stripLeadingMentions(raw: string): string {
  return raw.replace(/^(\s*@\S+\s+)+/, "");
}

export function parseFeishuCardActionValue(value: unknown): FeishuCommand {
  if (!isRecord(value)) {
    return { type: "unknown", raw: stringifyUnknown(value) };
  }

  if (value.action === "act:/workbench directory submit") {
    const interactionId = value.interaction_id;
    if (typeof interactionId !== "string" || interactionId === "") {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }

    const formValue = isRecord(value.form_value) ? value.form_value : value;
    return {
      type: "workbench_directory_submit",
      interactionId,
      ...optionalString("provider", formValue.provider),
      ...optionalString("workspacePath", formValue.workspace_path),
      ...optionalString("manualPath", formValue.manual_path)
    };
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

function optionalString(
  key: "provider" | "workspacePath" | "manualPath",
  value: unknown
): Record<typeof key, string> | Record<string, never> {
  if (typeof value !== "string" || value === "") {
    return {};
  }
  return { [key]: value } as Record<typeof key, string>;
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
