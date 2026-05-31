import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import {
  hasCapability,
  type UsageReport,
  type UsageReporter
} from "@integrations/agent/agent-capabilities.js";
import type {
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface UsageCommandDeps {
  providers: AgentProviderRegistry;
}

export class UsageCommandHandler implements SlashCommandHandler {
  readonly id = "usage";

  constructor(private readonly deps: UsageCommandDeps) {}

  async execute(): Promise<SlashCommandReply> {
    const active = this.deps.providers.active();
    if (!active) {
      return textReply("未激活任何 provider。运行 /provider use <kind> 激活后再查用量。");
    }
    let agent;
    try {
      agent = active.buildAgent();
    } catch (error) {
      return textReply(`构造 agent 失败: ${errorMessage(error)}`);
    }
    if (!hasCapability<UsageReporter>(agent, "getUsage")) {
      return textReply(`${active.displayName} (${active.kind}) 不支持用量查询。`);
    }
    let report: UsageReport;
    try {
      report = await agent.getUsage();
    } catch (error) {
      return textReply(`查询用量失败: ${errorMessage(error)}`);
    }
    return textReply(renderUsage(report));
  }
}

function renderUsage(report: UsageReport): string {
  const lines: string[] = [`📊 ${report.provider} 用量`];
  if (report.plan) lines.push(`  plan: ${report.plan}`);
  if (report.email) lines.push(`  account: ${report.email}`);

  for (const bucket of report.buckets) {
    lines.push("");
    const limitMark = bucket.limitReached ? " (limit reached)" : "";
    lines.push(`▸ ${bucket.name}${limitMark}`);
    for (const window of bucket.windows) {
      const bar = renderBar(window.usedPercent);
      const reset = window.resetAfterSeconds > 0 ? ` resets in ${formatDuration(window.resetAfterSeconds)}` : "";
      lines.push(`  ${window.name}: ${bar} ${window.usedPercent}%${reset}`);
    }
  }

  if (report.credits) {
    lines.push("");
    if (report.credits.unlimited) {
      lines.push("Credits: 不限");
    } else if (report.credits.hasCredits) {
      lines.push(`Credits: ${report.credits.balance}`);
    }
  }

  return lines.join("\n");
}

function renderBar(percent: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function textReply(text: string): SlashCommandReply {
  return { kind: "text", text };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
