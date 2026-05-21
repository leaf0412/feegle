import { stat } from "node:fs/promises";
import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import { listAgentKinds } from "../../../agent/agent-registry.js";
import {
  buildProviderAdapter,
  defaultProviderDisplayName
} from "../../../agent/provider-adapter-factory.js";
import {
  ProviderRecordSchema,
  type ProviderKind,
  type ProviderRecord,
  type ProviderStore
} from "../../../agent/provider-store.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";
import { isOwner } from "../../owner-access.js";
import { parseProviderArgs } from "./parse-provider-args.js";

export interface ProviderCommandDeps {
  ownerEmails: ReadonlySet<string>;
  providers: AgentProviderRegistry;
  providerStore: ProviderStore;
}

const CODEX_FIELDS = new Set(["cwd", "command", "sandbox", "approvalPolicy", "timeoutMs"]);
const CLAUDE_CODE_FIELDS = new Set(["cwd", "command", "timeoutMs"]);

function knownKinds(): readonly ProviderKind[] {
  return listAgentKinds() as ProviderKind[];
}

abstract class ProviderCommand implements SlashCommandHandler {
  readonly ownerOnly = true;

  constructor(protected readonly deps: ProviderCommandDeps) {}

  abstract readonly id: string;

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails);
  }

  abstract execute(context: SlashCommandContext): Promise<SlashCommandReply>;
}

export class ProviderRegisterCommandHandler extends ProviderCommand {
  readonly id = "provider_register";

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    let parsed;
    try {
      parsed = parseProviderArgs(context.args);
    } catch (error) {
      return textReply(`参数错误：${errorMessage(error)}\n用法：/provider register <kind> cwd=<path> [k=v...]`);
    }
    if (!isKnownKind(parsed.kind)) {
      const kinds = knownKinds().join(", ");
      return textReply(`未知 kind: ${parsed.kind}。可选: ${kinds}`);
    }
    const allowedFields = parsed.kind === "codex" ? CODEX_FIELDS : CLAUDE_CODE_FIELDS;
    for (const key of Object.keys(parsed.fields)) {
      if (!allowedFields.has(key)) {
        return textReply(`不识别的字段: ${key}`);
      }
    }
    if (!parsed.fields.cwd) {
      return textReply("cwd 是必填字段。用法：/provider register <kind> cwd=<path> [k=v...]");
    }

    let coerced: ProviderRecord;
    try {
      coerced = coerceRecord(parsed.kind, parsed.fields);
    } catch (error) {
      return textReply(errorMessage(error));
    }
    const cwd = coerced.cwd;
    if (!cwd) {
      return textReply("cwd 是必填字段。用法：/provider register <kind> cwd=<path> [k=v...]");
    }

    try {
      const info = await stat(cwd);
      if (!info.isDirectory()) {
        return textReply(`cwd 必须是目录: ${cwd}`);
      }
    } catch {
      return textReply(`cwd 路径不存在: ${cwd}`);
    }

    try {
      await this.deps.providerStore.upsert(coerced);
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes("already registered")) {
        return textReply(`${coerced.kind} 已注册。请先 /provider unregister ${coerced.kind} 再 register。`);
      }
      return textReply(`provider 配置写入失败: ${message}`);
    }
    this.deps.providers.register({
      kind: coerced.kind,
      displayName: defaultProviderDisplayName(coerced.kind),
      buildAgent: () => buildProviderAdapter(coerced)
    });
    return textReply(
      `${defaultProviderDisplayName(coerced.kind)} 已注册（未激活）。运行 /provider use ${coerced.kind} 激活。`
    );
  }
}

export class ProviderListCommandHandler extends ProviderCommand {
  readonly id = "provider_list";

  async execute(_context: SlashCommandContext): Promise<SlashCommandReply> {
    const snapshot = this.deps.providerStore.snapshot();
    if (snapshot.providers.length === 0) {
      return textReply(
        "尚未注册任何 provider。运行 /provider register <kind> cwd=<path> 注册。"
      );
    }
    const lines = ["已注册 provider:"];
    for (const record of snapshot.providers) {
      const fields: string[] = [`cwd=${record.cwd}`];
      if (record.command) fields.push(`command=${record.command}`);
      if (record.kind === "codex") {
        if (record.sandbox) fields.push(`sandbox=${record.sandbox}`);
        if (record.approvalPolicy) fields.push(`approvalPolicy=${record.approvalPolicy}`);
      }
      if (record.timeoutMs) fields.push(`timeoutMs=${record.timeoutMs}`);
      const marker = snapshot.activeKind === record.kind ? "★ active" : "—";
      lines.push(`- ${record.kind} ${marker} ${fields.join(" ")}`);
    }
    return textReply(lines.join("\n"));
  }
}

export class ProviderUseCommandHandler extends ProviderCommand {
  readonly id = "provider_use";

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const kind = context.args.trim();
    if (!kind) {
      return textReply("用法：/provider use <kind>");
    }
    if (!isKnownKind(kind)) {
      const kinds = knownKinds().join(", ");
      return textReply(`未知 kind: ${kind}。可选: ${kinds}`);
    }
    if (!this.deps.providers.resolve(kind)) {
      return textReply(`未注册: ${kind}。先 /provider register ${kind} cwd=...`);
    }
    try {
      await this.deps.providerStore.setActive(kind);
    } catch (error) {
      return textReply(`provider 激活失败: ${errorMessage(error)}`);
    }
    this.deps.providers.setActive(kind);
    return textReply(
      `${defaultProviderDisplayName(kind)} 已激活，自然语言聊天将走 ${defaultProviderDisplayName(kind)}。`
    );
  }
}

export class ProviderUnregisterCommandHandler extends ProviderCommand {
  readonly id = "provider_unregister";

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const kind = context.args.trim();
    if (!kind) {
      return textReply("用法：/provider unregister <kind>");
    }
    if (!isKnownKind(kind)) {
      const kinds = knownKinds().join(", ");
      return textReply(`未知 kind: ${kind}。可选: ${kinds}`);
    }
    if (!this.deps.providers.resolve(kind)) {
      return textReply(`未注册: ${kind}`);
    }
    let result: { activeCleared: boolean };
    try {
      result = await this.deps.providerStore.remove(kind);
    } catch (error) {
      return textReply(`provider 移除失败: ${errorMessage(error)}`);
    }
    this.deps.providers.unregister(kind);
    return textReply(
      result.activeCleared
        ? `${kind} 已移除（之前是 active，已清空）`
        : `${kind} 已移除`
    );
  }
}

function isKnownKind(kind: string): kind is ProviderKind {
  return (knownKinds() as readonly string[]).includes(kind);
}

function coerceRecord(kind: ProviderKind, fields: Record<string, string>): ProviderRecord {
  const raw: Record<string, unknown> = { kind, ...fields };
  if (typeof raw.timeoutMs === "string") {
    const numeric = Number(raw.timeoutMs);
    if (!Number.isFinite(numeric)) {
      throw new Error(`timeoutMs 必须是数字 (got ${raw.timeoutMs})`);
    }
    raw.timeoutMs = numeric;
  }
  const result = ProviderRecordSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(formatZodIssue(first));
  }
  return result.data;
}

function formatZodIssue(issue: { path: (string | number)[]; message: string; code: string }): string {
  const field = issue.path.filter((p) => p !== "kind").join(".");
  if (issue.code === "invalid_enum_value") {
    return `${field}: ${issue.message}`;
  }
  if (field === "timeoutMs") {
    return `timeoutMs 必须是正数`;
  }
  return field ? `${field}: ${issue.message}` : issue.message;
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
