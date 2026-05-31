import { parsePlatformAction, type PlatformAction } from "../../platform/platform-action.js";
import type { SlashCommandDefinition } from "../../platform/slash-command-catalog.js";

export type FeishuCommand =
  | { type: "help"; groupKey?: string }
  | { type: "slash_input"; raw: string }
  | { type: "slash_command"; definition: SlashCommandDefinition; raw: string }
  | { type: "chat"; raw: string }
  | { type: "repo_select"; repositoryIds: string[] }
  | { type: "push_repository"; requirementId: string; repositoryId: string }
  | {
      type: "workbench_plan_revision_submit";
      planId: string;
      version: number;
      revisionNote: string;
    }
  | {
      type: "workbench_plan_revise";
      planId: string;
      version: number;
    }
  | { type: "workbench_plan_approve"; planId: string; version: number }
  | { type: "workbench_plan_cancel"; planId: string; version: number }
  | { type: "workbench_plan_reject"; planId: string; version: number }
  | { type: "workbench_plan_push"; planId: string; version: number }
  | { type: "workbench_plan_cleanup"; planId: string; version: number }
  | {
      type: "workbench_plan_base_branch_submit";
      planId: string;
      version: number;
      baseBranch: string;
      headBranch?: string;
    }
  | { type: "workbench_plan_revise_execution"; planId: string; version: number }
  | {
      type: "workbench_plan_revise_execution_submit";
      planId: string;
      version: number;
      note: string;
    }
  | {
      type: "bind_repo_submit";
      url: string;
      scopeKey: string;
      scopeNoun: string;
    }
  | { type: "bind_repo_cancel"; scopeKey: string }
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

  if (value.action === "act:/workbench plan revise submit") {
    const planId = value.plan_id;
    const version = parsePositiveInteger(value.version);
    const formValue = isRecord(value.form_value) ? value.form_value : value;
    const revisionNote = formValue.revision_note;
    if (
      typeof planId !== "string" ||
      planId === "" ||
      version === undefined ||
      typeof revisionNote !== "string" ||
      revisionNote === ""
    ) {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }
    return {
      type: "workbench_plan_revision_submit",
      planId,
      version,
      revisionNote
    };
  }

  if (value.action === "act:/workbench plan revise") {
    const planId = value.plan_id;
    const version = parsePositiveInteger(value.version);
    if (typeof planId !== "string" || planId === "" || version === undefined) {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }
    return {
      type: "workbench_plan_revise",
      planId,
      version
    };
  }

  const simplePlanActions = {
    "act:/workbench plan approve": "workbench_plan_approve",
    "act:/workbench plan cancel": "workbench_plan_cancel",
    "act:/workbench plan reject": "workbench_plan_reject",
    "act:/workbench plan push": "workbench_plan_push",
    "act:/workbench plan cleanup": "workbench_plan_cleanup",
    "act:/workbench plan revise_execution": "workbench_plan_revise_execution"
  } as const;
  if (typeof value.action === "string" && value.action in simplePlanActions) {
    const planId = value.plan_id;
    const version = parsePositiveInteger(value.version);
    if (typeof planId !== "string" || planId === "" || version === undefined) {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }
    return {
      type: simplePlanActions[value.action as keyof typeof simplePlanActions],
      planId,
      version
    };
  }

  if (value.action === "act:/workbench plan base_branch_submit") {
    const planId = value.plan_id;
    const version = parsePositiveInteger(value.version);
    const formValue = isRecord(value.form_value) ? value.form_value : value;
    const manual = typeof formValue.base_branch_manual === "string" ? formValue.base_branch_manual.trim() : "";
    const selected = typeof formValue.base_branch === "string" ? formValue.base_branch.trim() : "";
    const baseBranch = manual || selected;
    const headBranchRaw = typeof formValue.head_branch === "string" ? formValue.head_branch.trim() : "";
    if (typeof planId !== "string" || planId === "" || version === undefined || baseBranch === "") {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }
    return {
      type: "workbench_plan_base_branch_submit",
      planId,
      version,
      baseBranch,
      ...(headBranchRaw ? { headBranch: headBranchRaw } : {})
    };
  }

  if (value.action === "act:/workbench plan revise_execution_submit") {
    const planId = value.plan_id;
    const version = parsePositiveInteger(value.version);
    const formValue = isRecord(value.form_value) ? value.form_value : value;
    const note = formValue.revision_note;
    if (
      typeof planId !== "string" ||
      planId === "" ||
      version === undefined ||
      typeof note !== "string" ||
      note.trim() === ""
    ) {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }
    return {
      type: "workbench_plan_revise_execution_submit",
      planId,
      version,
      note
    };
  }

  if (value.action === "act:/repo bind_submit") {
    const formValue = isRecord(value.form_value) ? value.form_value : value;
    const url = typeof formValue.repo_url === "string" ? formValue.repo_url.trim() : "";
    const scopeKey = typeof value.scope_key === "string" ? value.scope_key : "";
    const scopeNoun = typeof value.scope_noun === "string" && value.scope_noun !== "" ? value.scope_noun : "本群";
    if (url === "" || scopeKey === "") {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }
    return { type: "bind_repo_submit", url, scopeKey, scopeNoun };
  }

  if (value.action === "act:/repo bind_cancel") {
    const scopeKey = typeof value.scope_key === "string" ? value.scope_key : "";
    if (scopeKey === "") {
      return { type: "unknown", raw: stringifyUnknown(value) };
    }
    return { type: "bind_repo_cancel", scopeKey };
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

function parsePositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
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
