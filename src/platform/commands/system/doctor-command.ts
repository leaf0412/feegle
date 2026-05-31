import { access, constants } from "node:fs/promises";
import type { AgentProviderRegistry } from "../../../agent/agent-provider-registry.js";
import {
  hasCapability,
  type DoctorCheckResult,
  type DoctorChecker,
  type DoctorStatus
} from "../../../agent/agent-capabilities.js";
import type { ConfigStorePort } from "@infra/app/config-store.js";
import type {
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface DoctorCommandDeps {
  feegleHome?: string;
  configStore: ConfigStorePort;
  providers: AgentProviderRegistry;
}

export class DoctorCommandHandler implements SlashCommandHandler {
  readonly id = "doctor";

  constructor(private readonly deps: DoctorCommandDeps) {}

  async execute(): Promise<SlashCommandReply> {
    const checks: DoctorCheckResult[] = [];
    checks.push(await this.checkFeegleHome());
    checks.push(this.checkFailureTarget());
    checks.push(...this.checkProviders());
    checks.push(...(await this.checkActiveAgent()));

    const lines: string[] = ["🩺 /doctor 诊断结果"];
    for (const result of checks) {
      lines.push(`  ${icon(result.status)} ${result.name}: ${result.detail}`);
    }
    const failed = checks.some((c) => c.status === "fail");
    lines.push("");
    lines.push(failed ? "❌ 存在 fail 项，建议尽快处理。" : "✅ 全部通过。");
    return { kind: "text", text: lines.join("\n") };
  }

  private async checkFeegleHome(): Promise<DoctorCheckResult> {
    if (!this.deps.feegleHome) {
      return { name: "FEEGLE_HOME", status: "warn", detail: "未注入路径，跳过检查" };
    }
    try {
      await access(this.deps.feegleHome, constants.R_OK | constants.W_OK);
      return { name: "FEEGLE_HOME", status: "ok", detail: this.deps.feegleHome };
    } catch (error) {
      return { name: "FEEGLE_HOME", status: "fail", detail: `不可读写: ${errorMessage(error)}` };
    }
  }

  private checkFailureTarget(): DoctorCheckResult {
    const target = this.deps.configStore.get().failureTarget;
    if (target) {
      return { name: "failureTarget", status: "ok", detail: `${target.platform}:${target.chatId}` };
    }
    return { name: "failureTarget", status: "warn", detail: "未配置，失败通知将丢弃 — 运行 /error_target set" };
  }

  private checkProviders(): DoctorCheckResult[] {
    const available = this.deps.providers.available();
    if (available.length === 0) {
      return [
        {
          name: "provider 注册",
          status: "fail",
          detail: "未注册任何 provider — 运行 /provider register <kind> cwd=..."
        }
      ];
    }
    const active = this.deps.providers.active();
    return [
      { name: "provider 注册", status: "ok", detail: `${available.length} 个: ${available.map((p) => p.kind).join(", ")}` },
      active
        ? { name: "active provider", status: "ok" as DoctorStatus, detail: `${active.displayName} (${active.kind})` }
        : { name: "active provider", status: "warn" as DoctorStatus, detail: "未激活 — 运行 /provider use <kind>" }
    ];
  }

  private async checkActiveAgent(): Promise<DoctorCheckResult[]> {
    const active = this.deps.providers.active();
    if (!active) {
      return [];
    }
    let agent;
    try {
      agent = active.buildAgent();
    } catch (error) {
      return [
        {
          name: `agent ${active.kind}`,
          status: "fail",
          detail: `构造失败: ${errorMessage(error)}`
        }
      ];
    }
    if (!hasCapability<DoctorChecker>(agent, "doctorChecks")) {
      return [];
    }
    try {
      return await agent.doctorChecks();
    } catch (error) {
      return [
        {
          name: `agent ${active.kind}`,
          status: "fail",
          detail: `DoctorChecker 抛错: ${errorMessage(error)}`
        }
      ];
    }
  }
}

function icon(status: DoctorStatus): string {
  if (status === "ok") return "✅";
  if (status === "warn") return "⚠️";
  return "❌";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
