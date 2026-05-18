import { Cron } from "croner";
import { ulid } from "ulid";
import type { NotificationTarget } from "../../../app/notification-port.js";
import type { Task } from "../../../scheduler/task.js";
import type { SlashCommandContext, SlashCommandHandler, SlashCommandReply } from "../../slash-command-handler.js";
import { isOwner } from "../../owner-access.js";
import type { SchedulerCommandDeps } from "../scheduler-command-deps.js";

abstract class CronCommand implements SlashCommandHandler {
  readonly ownerOnly = true;

  constructor(protected readonly deps: SchedulerCommandDeps) {}

  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerIdentities);
  }

  abstract readonly id: string;
  abstract execute(context: SlashCommandContext): Promise<SlashCommandReply>;

  protected resolveTask(prefix: string): Task {
    const matches = this.deps.taskRegistry.findByPrefix(prefix.trim());
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length === 0) {
      throw new Error(`未找到任务: ${prefix}`);
    }
    throw new Error(`任务 ID 前缀不唯一: ${matches.map((task) => task.id).join(", ")}`);
  }
}

export class CronListCommandHandler extends CronCommand {
  readonly id = "cron_list";
  async execute(): Promise<SlashCommandReply> {
    const tasks = this.deps.taskRegistry.list();
    if (tasks.length === 0) {
      return { kind: "text", text: "暂无定时任务。" };
    }
    const rows = tasks.map((task) => {
      const next = task.enabled ? nextRunDescription(task.cron, task.timezone) : "paused";
      return `${task.id.slice(0, 12)}  ${task.kind.padEnd(26)} ${task.cron.padEnd(14)} ${task.enabled ? "yes" : "no "}  next: ${next}`;
    });
    return { kind: "text", text: rows.join("\n") };
  }
}

export class CronShowCommandHandler extends CronCommand {
  readonly id = "cron_show";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const task = this.resolveTask(context.args);
    return { kind: "text", text: renderTaskDetail(task) };
  }
}

export class CronAddCommandHandler extends CronCommand {
  readonly id = "cron_add";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const [kindId, cronExpr, ...pairs] = parseArgs(context.args);
    if (!kindId || !cronExpr) {
      return commandError("/cron add", "缺少 kind 或 cron", context.definition.command);
    }
    if (!isValidCron(cronExpr)) {
      return commandError("/cron add", `非法 cron: ${cronExpr}`, context.definition.command);
    }
    const kind = this.deps.kinds.get(kindId);
    if (!kind) {
      return commandError("/cron add", `未知 kind: ${kindId}`, context.definition.command);
    }
    const parsed = parseKeyValues(pairs);
    const params = parsed.params;
    kind.parseParams(params);
    const now = new Date().toISOString();
    const task: Task = {
      id: ulid(),
      name: String(parsed.top.name ?? kindId),
      kind: kindId,
      params,
      cron: cronExpr,
      timezone: String(parsed.top.tz ?? "Asia/Shanghai"),
      activeHours: typeof parsed.top.active === "string" ? parsed.top.active.split(",").filter(Boolean) : null,
      target: targetFrom(context.chatId, parsed.top.target),
      enabled: true,
      source: "user",
      errorPolicy: policyFrom(parsed.top.policy),
      createdAt: now,
      updatedAt: now,
      lastRun: null,
      consecutiveFailures: 0,
      lastErrorNotifiedAt: null
    };
    await this.deps.taskRegistry.add(task);
    return { kind: "text", text: `✅ 已创建任务 ${task.id}` };
  }
}

export class CronEditCommandHandler extends CronCommand {
  readonly id = "cron_edit";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const [id, ...pairs] = parseArgs(context.args);
    const task = this.resolveTask(id ?? "");
    const parsed = parseKeyValues(pairs);
    const patch: Partial<Task> = {};
    if (parsed.top.name) patch.name = String(parsed.top.name);
    if (parsed.top.cron) {
      if (!isValidCron(String(parsed.top.cron))) return commandError("/cron edit", "非法 cron", context.definition.command);
      patch.cron = String(parsed.top.cron);
    }
    if (parsed.top.tz) patch.timezone = String(parsed.top.tz);
    if (parsed.top.policy) patch.errorPolicy = policyFrom(parsed.top.policy);
    if (parsed.top.target !== undefined) patch.target = targetFrom(context.chatId, parsed.top.target);
    if (Object.keys(parsed.params).length > 0) patch.params = { ...task.params, ...parsed.params };
    await this.deps.taskRegistry.update(task.id, patch);
    return { kind: "text", text: `✅ 已更新任务 ${task.id}` };
  }
}

export class CronRemoveCommandHandler extends CronCommand {
  readonly id = "cron_remove";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const task = this.resolveTask(context.args);
    await this.deps.taskRegistry.remove(task.id);
    return { kind: "text", text: `✅ 已删除任务 ${task.id}` };
  }
}

export class CronPauseCommandHandler extends CronCommand {
  readonly id = "cron_pause";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const task = this.resolveTask(context.args);
    await this.deps.taskRegistry.update(task.id, { enabled: false });
    return { kind: "text", text: `✅ 已暂停任务 ${task.id}` };
  }
}

export class CronResumeCommandHandler extends CronCommand {
  readonly id = "cron_resume";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const task = this.resolveTask(context.args);
    await this.deps.taskRegistry.update(task.id, { enabled: true });
    return { kind: "text", text: `✅ 已恢复任务 ${task.id}` };
  }
}

export class CronRunNowCommandHandler extends CronCommand {
  readonly id = "cron_run_now";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const [id, force] = parseArgs(context.args);
    const task = this.resolveTask(id ?? "");
    try {
      const result = await this.deps.scheduler.runOnce(task.id, { force: force === "--force" });
      return { kind: "text", text: `✅ run-now 完成（耗时 ${result.durationMs}ms，outcome=${result.status}）` };
    } catch (error) {
      return { kind: "text", text: `❌ run-now 失败: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}

export class CronSetTargetCommandHandler extends CronCommand {
  readonly id = "cron_set_target";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const [id, target] = parseArgs(context.args);
    const task = this.resolveTask(id ?? "");
    await this.deps.taskRegistry.update(task.id, { target: targetFrom(context.chatId, target) });
    return { kind: "text", text: `✅ 任务 ${task.id} 的通知群已更新。` };
  }
}

export class CronHistoryCommandHandler extends CronCommand {
  readonly id = "cron_history";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const [id] = parseArgs(context.args);
    const task = this.resolveTask(id ?? "");
    if (!this.deps.runsLog) return { kind: "text", text: "运行历史尚未接入。" };
    const rows: string[] = [];
    for await (const entry of this.deps.runsLog.tailReverse({ taskId: task.id, limit: 10 })) {
      rows.push(`${entry.at} ${entry.outcome} ${entry.durationMs}ms ${entry.note ?? ""}`.trim());
    }
    return { kind: "text", text: rows.length ? rows.join("\n") : "暂无运行历史。" };
  }
}

function commandError(command: string, message: string, usage: string): SlashCommandReply {
  return { kind: "text", text: `❌ ${command}: ${message}\n用法: ${usage}` };
}

function parseArgs(args: string): string[] {
  return args.match(/"[^"]+"|\S+/g)?.map((value) => value.replace(/^"|"$/g, "")) ?? [];
}

function parseKeyValues(pairs: string[]): { top: Record<string, unknown>; params: Record<string, unknown> } {
  const topKeys = new Set(["name", "cron", "tz", "active", "target", "policy"]);
  const top: Record<string, unknown> = {};
  const params: Record<string, unknown> = {};
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    if (!key || rest.length === 0) continue;
    const value = coerceValue(rest.join("="));
    if (topKeys.has(key)) top[key] = value;
    else params[key] = value;
  }
  return { top, params };
}

function coerceValue(value: string): unknown {
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value.replace(/^"|"$/g, "");
}

function targetFrom(currentChatId: string, input: unknown): NotificationTarget | null {
  if (input === "none") return null;
  return { platform: "feishu", chatId: typeof input === "string" && input ? input : currentChatId };
}

function policyFrom(input: unknown): Task["errorPolicy"] {
  return input === "always" || input === "silent" ? input : "on-change";
}

function renderTaskDetail(task: Task): string {
  const lines = [
    `id: ${task.id}`,
    `name: ${task.name}`,
    `kind: ${task.kind}`,
    `cron: ${task.cron}  (tz=${task.timezone})`,
    `activeHours: ${task.activeHours?.join(", ") ?? "—"}`,
    `target: ${task.target ? `${task.target.platform}:${task.target.chatId}` : "—"}`,
    `enabled: ${task.enabled}`,
    `source: ${task.source}`,
    `errorPolicy: ${task.errorPolicy}`,
    `consecutiveFailures: ${task.consecutiveFailures}`,
    `lastErrorNotifiedAt: ${task.lastErrorNotifiedAt ?? "—"}`,
    `createdAt: ${task.createdAt}`,
    `updatedAt: ${task.updatedAt}`
  ];
  if (Object.keys(task.params).length > 0) {
    lines.push(`params: ${JSON.stringify(task.params)}`);
  }
  if (task.lastRun) {
    lines.push(
      `lastRun: ${task.lastRun.at}  status=${task.lastRun.status}  ${task.lastRun.durationMs}ms${task.lastRun.note ? `  note=${task.lastRun.note}` : ""}`
    );
  } else {
    lines.push("lastRun: —");
  }
  lines.push(`next: ${task.enabled ? nextRunDescription(task.cron, task.timezone) : "paused"}`);
  return lines.join("\n");
}

export function nextRunDescription(expression: string, timezone: string, now: Date = new Date()): string {
  try {
    const job = new Cron(expression, { timezone, paused: true });
    const next = job.nextRun(now);
    if (!next) return "ERROR(no upcoming fire time)";
    return next.toISOString();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[cron] next-run compute failed: cron=${expression} tz=${timezone} reason=${message}`);
    return `ERROR(${message})`;
  }
}

function isValidCron(expression: string): boolean {
  try {
    new Cron(expression, { paused: true });
    return true;
  } catch {
    return false;
  }
}
