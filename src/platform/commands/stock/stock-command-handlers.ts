import { createPlatformCard } from "@platform/platform-card.js";
import type { Task } from "@features/scheduler/task.js";
import { normalizeStockCode, type StockCode } from "@integrations/stock/stock-code.js";
import { pnlForEntry } from "@integrations/stock/stock-domain.js";
import type { PortfolioPatch, Threshold } from "@integrations/stock/stock-store-types.js";
import type { SlashCommandContext, SlashCommandHandler, SlashCommandReply } from "../../slash-command-handler.js";
import { isOwner } from "../../owner-access.js";
import type { SchedulerCommandDeps } from "../scheduler-command-deps.js";

abstract class StockCommand implements SlashCommandHandler {
  readonly ownerOnly = true;
  constructor(protected readonly deps: SchedulerCommandDeps) {}
  canAccess(context: SlashCommandContext): boolean {
    return isOwner(context, this.deps.ownerEmails);
  }
  abstract readonly id: string;
  abstract execute(context: SlashCommandContext): Promise<SlashCommandReply>;
}

export class BindStocksCommandHandler extends StockCommand {
  readonly id = "bind_stocks";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const codes = parseCodes(context.args);
    const result = await this.deps.stockStore.addSubscriptions(codes, `${context.sender.platform}:${context.sender.userId}`);
    const task = await ensureDomainTask(this.deps, context.chatId, "stock-monitor", "*/5 * * * *", ["09:25-11:30", "13:00-15:00"]);
    return {
      kind: "text",
      text: `✅ 已订阅 ${result.added.length} 只；任务 ID: ${task.id}; 监控时段 09:25-11:30 / 13:00-15:00 每 5 分钟。`
    };
  }
}

export class UnbindStocksCommandHandler extends StockCommand {
  readonly id = "unbind_stocks";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const result = await this.deps.stockStore.removeSubscriptions(parseCodes(context.args));
    if (this.deps.stockStore.listSubscriptions().length === 0) {
      for (const task of this.deps.taskRegistry.list().filter((item) => item.kind === "stock-monitor" && item.source === "domain")) {
        await this.deps.taskRegistry.update(task.id, { enabled: false });
      }
    }
    return { kind: "text", text: `removed: ${result.removed.join(",") || "-"}\nmissing: ${result.missing.join(",") || "-"}` };
  }
}

export class StocksCommandHandler extends StockCommand {
  readonly id = "stocks";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const codes = context.args.trim() ? parseCodes(context.args) : this.deps.stockStore.listSubscriptions().map((item) => item.stockCode);
    const quotes = await this.deps.quote.query(codes);
    const lines = quotes.map((quote) => {
      const entry = this.deps.stockStore.getPortfolio(quote.stockCode);
      const pnl = entry ? pnlForEntry(quote, entry) : undefined;
      return `${quote.stockCode} ${quote.name} ¥${quote.current.toFixed(2)}${pnl ? ` PnL ${pnl.pnl.toFixed(2)} (${pnl.pnlPct.toFixed(2)}%)` : ""}`;
    });
    return { kind: "card", card: createPlatformCard().title("股票行情", "blue").markdown(lines.join("\n") || "暂无股票。").build() };
  }
}

export class PortfolioSetCommandHandler extends StockCommand {
  readonly id = "portfolio_set";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const [rawCode, ...pairs] = splitArgs(context.args);
    if (!rawCode || pairs.length === 0) return error("portfolio set", "缺少 code 或 k=v", context.definition.command);
    const code = normalizeStockCode(rawCode);
    const current = this.deps.stockStore.getPortfolio(code);
    const parsed = parsePortfolioPatch(pairs, current?.thresholds ?? []);
    if (!current && (parsed.patch.costPrice === undefined || parsed.patch.shares === undefined)) {
      return error("portfolio set", "新持仓必须提供 cost 和 shares", context.definition.command);
    }
    const entry = await this.deps.stockStore.setPortfolio(code, parsed.patch);
    await ensureDomainTask(this.deps, context.chatId, "stock-portfolio-snapshot", "10 15 * * 1-5", null);
    return { kind: "text", text: `✅ 已更新 ${code}: shares=${entry.shares}, cost=${entry.costPrice}` };
  }
}

export class PortfolioListCommandHandler extends StockCommand {
  readonly id = "portfolio_list";
  async execute(): Promise<SlashCommandReply> {
    const rows = this.deps.stockStore.listPortfolio().map((entry) => `${entry.stockCode} shares=${entry.shares} cost=${entry.costPrice}`);
    return { kind: "text", text: rows.length ? rows.join("\n") : "暂无持仓。" };
  }
}

export class PortfolioClearCommandHandler extends StockCommand {
  readonly id = "portfolio_clear";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const code = normalizeStockCode(context.args);
    const existed = await this.deps.stockStore.clearPortfolio(code);
    return { kind: "text", text: existed ? `✅ 已清除 ${code}` : `${code} 原本不存在。` };
  }
}

export class PortfolioUnsetCommandHandler extends StockCommand {
  readonly id = "portfolio_unset";
  async execute(context: SlashCommandContext): Promise<SlashCommandReply> {
    const [rawCode, field] = splitArgs(context.args);
    const code = normalizeStockCode(rawCode ?? "");
    if (field !== "stopLoss" && field !== "thresholds") return error("portfolio unset", "field 仅支持 stopLoss 或 thresholds", context.definition.command);
    await this.deps.stockStore.unsetPortfolioField(code, field);
    return { kind: "text", text: `✅ 已清空 ${code} 的 ${field}` };
  }
}

function parseCodes(input: string): StockCode[] {
  const rawCodes = input.split(/[\s,]+/).filter(Boolean);
  if (rawCodes.length === 0) throw new Error("缺少股票代码");
  return rawCodes.map(normalizeStockCode);
}

function splitArgs(input: string): string[] {
  return input.match(/"[^"]+"|\S+/g)?.map((value) => value.replace(/^"|"$/g, "")) ?? [];
}

function parsePortfolioPatch(pairs: string[], currentThresholds: Threshold[]): { patch: PortfolioPatch } {
  const patch: PortfolioPatch = {};
  let thresholds = [...currentThresholds];
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    const value = rest.join("=");
    if (key === "cost") patch.costPrice = Number(value);
    else if (key === "shares") patch.shares = Number(value);
    else if (key === "stopLoss") patch.stopLoss = Number(value);
    else if (key === "name") patch.name = value;
    else if (key === "threshold+") {
      const [level, op, price, note] = value.split(":");
      if (!level || !isOp(op) || !price || !note) throw new Error("threshold+ 格式应为 level:op:price:note");
      thresholds.push({ level, op, price: Number(price), note });
      patch.thresholds = thresholds;
    } else if (key === "threshold-") {
      thresholds = thresholds.filter((item) => item.level !== value);
      patch.thresholds = thresholds;
    }
  }
  return { patch };
}

function isOp(value: string | undefined): value is Threshold["op"] {
  return value === "<=" || value === ">=" || value === "<" || value === ">";
}

function error(command: string, message: string, usage: string): SlashCommandReply {
  return { kind: "text", text: `❌ ${command}: ${message}\n用法: ${usage}` };
}

async function ensureDomainTask(
  deps: SchedulerCommandDeps,
  chatId: string,
  kind: string,
  cron: string,
  activeHours: string[] | null
): Promise<Task> {
  const existing = deps.taskRegistry
    .list()
    .find((task) => task.kind === kind && task.source === "domain" && task.target?.chatId === chatId);
  if (existing) {
    if (!existing.enabled) {
      return deps.taskRegistry.update(existing.id, { enabled: true });
    }
    return existing;
  }
  const now = new Date().toISOString();
  const task: Task = {
    id: `domain_${kind}_${Date.now()}`,
    name: kind,
    kind,
    params: {},
    cron,
    timezone: "Asia/Shanghai",
    activeHours,
    target: { platform: "feishu", chatId },
    enabled: true,
    source: "domain",
    errorPolicy: "on-change",
    createdAt: now,
    updatedAt: now,
    lastRun: null,
    consecutiveFailures: 0,
    lastErrorNotifiedAt: null
  };
  await deps.taskRegistry.add(task);
  return task;
}
