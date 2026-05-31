import os from "node:os";
import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import type { RunsLog } from "@features/scheduler/runs-log.js";
import type { TaskRegistry } from "@features/scheduler/task-registry.js";
import type {
  SlashCommandHandler,
  SlashCommandReply
} from "../../slash-command-handler.js";

export interface StatusCommandDeps {
  taskRegistry: TaskRegistry;
  providers: AgentProviderRegistry;
  runsLog?: Pick<RunsLog, "tailReverse">;
}

export class StatusCommandHandler implements SlashCommandHandler {
  readonly id = "status";

  constructor(private readonly deps: StatusCommandDeps) {}

  async execute(): Promise<SlashCommandReply> {
    const tasks = this.deps.taskRegistry.list();
    const enabled = tasks.filter((task) => task.enabled).length;
    const activeKind = this.deps.providers.activeKindName();
    const lastRun = await readLastRun(this.deps.runsLog);

    const lines: string[] = ["🩺 feegle status"];
    lines.push(`  uptime: ${formatUptime(process.uptime())}`);
    lines.push(`  host: ${os.hostname()} (pid ${process.pid})`);
    lines.push(`  memory: ${formatMemory(process.memoryUsage().rss)}`);
    lines.push("");
    lines.push(`  default agent (config/cron): ${activeKind ?? "(none; chat balances across all registered)"}`);
    lines.push(`  tasks: ${enabled}/${tasks.length} enabled`);
    if (lastRun) {
      lines.push(
        `  last run: ${lastRun.taskId} (${lastRun.kind}) ${lastRun.outcome} @ ${lastRun.at}`
      );
    } else {
      lines.push("  last run: (no runs yet)");
    }

    return { kind: "text", text: lines.join("\n") };
  }
}

async function readLastRun(
  runsLog: StatusCommandDeps["runsLog"]
): Promise<{ taskId: string; kind: string; outcome: string; at: string } | undefined> {
  if (!runsLog) {
    return undefined;
  }
  for await (const entry of runsLog.tailReverse({ limit: 1 })) {
    return entry;
  }
  return undefined;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatMemory(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
