import { execa } from "execa";
import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import type { ProviderStorePort } from "@integrations/agent/provider-store.js";
import { isOwner } from "../../owner-access.js";
import type {
  SlashCommandContext,
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface ShellCommandDeps {
  providers: AgentProviderRegistry;
  providerStore: ProviderStorePort;
  ownerEmails?: ReadonlySet<string>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 4096;

export class ShellCommandHandler implements SlashCommandHandler {
  readonly id = "shell";
  readonly ownerOnly = true;

  constructor(private readonly deps: ShellCommandDeps) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails ?? new Set());
  }

  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const command = context.args.trim();
    if (!command) {
      return textReply("用法：/shell <命令>（在 active provider 的 cwd 下执行）");
    }
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活 provider — /shell 需要从 active provider 取 cwd，先 /provider use <kind>。");
    }
    const record = this.deps.providerStore.snapshot().providers.find((p) => p.kind === active.kind);
    if (!record) {
      return textReply(`找不到 ${active.kind} provider 记录。`);
    }
    if (!record.cwd) {
      return textReply("provider 未设置工作目录，/shell 需要 cwd。请运行 /dir use <workspace> 设置。");
    }
    const timeout = this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const result = await execa(command, {
        cwd: record.cwd,
        shell: "/bin/sh",
        timeout,
        reject: false
      });
      const stdout = truncate(result.stdout);
      const stderr = truncate(result.stderr);
      const lines: string[] = [`$ ${command}`, `cwd: ${record.cwd}`, `exit: ${result.exitCode ?? "?"}`];
      if (stdout) lines.push("--- stdout ---", stdout);
      if (stderr) lines.push("--- stderr ---", stderr);
      return textReply(lines.join("\n"));
    } catch (error) {
      return textReply(`执行失败: ${errorMessage(error)}`);
    }
  }
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_BYTES) return text.trim();
  return `${text.slice(0, MAX_OUTPUT_BYTES)}…（已截断 ${text.length - MAX_OUTPUT_BYTES} 字符）`;
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
