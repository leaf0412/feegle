import cron from "node-cron";
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
    if (!cron.validate(cronExpr)) {
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
      if (!cron.validate(String(parsed.top.cron))) return commandError("/cron edit", "非法 cron", context.definition.command);
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

function nextRunDescription(expression: string, timezone: string): string {
  try {
    const next = nextCronTime(expression, timezone);
    if (!next) return "unknown";
    return next.toISOString();
  } catch {
    return "invalid-cron";
  }
}

function nextCronTime(expression: string, timezone: string): Date | null {
  if (!cron.validate(expression)) return null;
  const candidate = computeNextFromCron(expression, timezone);
  return candidate ?? null;
}

function computeNextFromCron(expression: string, timezone: string): Date | null {
  // node-cron does not expose a "next fire time" calculator. Approximate by
  // probing each minute up to 31 days ahead and returning the first match.
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minutePart, hourPart, domPart, monthPart, dowPart] = parts;
  const matchers = {
    minute: parseField(minutePart, 0, 59),
    hour: parseField(hourPart, 0, 23),
    dom: parseField(domPart, 1, 31),
    month: parseField(monthPart, 1, 12),
    dow: parseField(dowPart, 0, 6)
  };
  if (Object.values(matchers).some((m) => !m)) return null;
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);
  for (let step = 0; step < 60 * 24 * 31; step += 1) {
    const candidate = new Date(start.getTime() + step * 60_000);
    const local = wallClock(candidate, timezone);
    if (
      matchers.minute!.has(local.minute) &&
      matchers.hour!.has(local.hour) &&
      matchers.dom!.has(local.day) &&
      matchers.month!.has(local.month) &&
      matchers.dow!.has(local.dow)
    ) {
      return candidate;
    }
  }
  return null;
}

function parseField(spec: string, min: number, max: number): Set<number> | null {
  if (spec === "*") {
    return new Set(rangeNumbers(min, max));
  }
  const parts = spec.split(",");
  const values = new Set<number>();
  for (const part of parts) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const stride = stepMatch ? Number(stepMatch[2]) : 1;
    const body = stepMatch ? stepMatch[1] : part;
    let start = min;
    let end = max;
    if (body !== "*") {
      const range = body.split("-");
      if (range.length === 1) {
        start = Number(range[0]);
        end = stepMatch ? max : start;
      } else if (range.length === 2) {
        start = Number(range[0]);
        end = Number(range[1]);
      } else {
        return null;
      }
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < min || end > max) return null;
    for (let value = start; value <= end; value += stride) {
      values.add(value);
    }
  }
  return values;
}

function rangeNumbers(min: number, max: number): number[] {
  const out: number[] = [];
  for (let value = min; value <= max; value += 1) out.push(value);
  return out;
}

function wallClock(date: Date, timezone: string): { minute: number; hour: number; day: number; month: number; dow: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short"
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? "0";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    minute: Number(get("minute")),
    hour: Number(get("hour")),
    day: Number(get("day")),
    month: Number(get("month")),
    dow: dowMap[get("weekday")] ?? 0
  };
}
