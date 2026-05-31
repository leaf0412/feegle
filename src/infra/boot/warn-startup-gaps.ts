import type { ConfigStorePort } from "../app/config-store.js";
import type { TaskRegistry } from "@features/scheduler/task-registry.js";
import type { AgentProviderRegistry } from "../../agent/agent-provider-registry.js";

export interface AgentReadiness {
  kind: string;
  active: boolean;
  status: "ok" | "warn";
  message: string;
}

/**
 * Verify EVERY registered agent provider at startup by constructing it: buildAgent() runs
 * resolveBinary(), which locates the CLI on PATH and throws when it is missing. Returns one result
 * per provider for the caller to log — never throws, so a missing binary warns but does not abort
 * boot. The active provider is flagged so a missing active agent stands out.
 */
export function checkAgentReadiness(providers: AgentProviderRegistry): AgentReadiness[] {
  const available = providers.available();
  if (available.length === 0) {
    return [
      {
        kind: "(none)",
        active: false,
        status: "warn",
        message: "⚠️ no agent providers registered; agent tasks/commands will fail. Configure agent in ~/.feegle/config.jsonc."
      }
    ];
  }
  const activeKind = providers.active()?.kind;
  return available.map((provider) => {
    const active = provider.kind === activeKind;
    const marker = active ? " (active)" : "";
    try {
      provider.buildAgent();
      return {
        kind: provider.kind,
        active,
        status: "ok" as const,
        message: `agent ${provider.kind}${marker} ready (CLI binary resolved on PATH).`
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        kind: provider.kind,
        active,
        status: "warn" as const,
        message: `⚠️ agent ${provider.kind}${marker} unavailable: ${detail}`
      };
    }
  });
}

export function warnStartupGaps(
  configStore: ConfigStorePort,
  taskRegistry: TaskRegistry,
  ownerEmails: ReadonlySet<string>
): void {
  const tasks = taskRegistry.list();
  if (configStore.get().failureTarget === null && tasks.some((task) => task.enabled)) {
    console.warn("⚠️ failureTarget not configured; enabled tasks exist. Run /error_target set in your target Feishu chat.");
  }
  if (ownerEmails.size === 0 && tasks.some((task) => task.source === "domain" || task.source === "user")) {
    console.warn("⚠️ ownerEmails 未配置（~/.feegle/config.jsonc）; all owner-only commands will be silently denied.");
  }
}
