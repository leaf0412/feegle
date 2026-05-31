import type { StockCode } from "./stock-code.js";
import type { PortfolioEntry, Threshold } from "./stock-store-types.js";
import type { Quote } from "./stock-quote-port.js";

export interface MatchedCondition {
  stockCode: StockCode;
  level: string;
  conditionKey: string;
  op: Threshold["op"];
  price: number;
  current: number;
  note: string;
  priority: "urgent" | "high" | "normal";
}

export function matchThresholds(
  quote: Quote,
  entry: PortfolioEntry,
  tolerancePrice = 0.02
): MatchedCondition[] {
  const thresholds = thresholdsWithStopLoss(entry);
  return thresholds
    .filter((threshold) => matches(quote.current, threshold, tolerancePrice))
    .map((threshold): MatchedCondition => {
      const priority: MatchedCondition["priority"] = threshold.level === "stop" ? "urgent" : "high";
      return {
        stockCode: quote.stockCode,
        level: threshold.level,
        conditionKey: `${quote.stockCode}:${threshold.level}`,
        op: threshold.op,
        price: threshold.price,
        current: quote.current,
        note: threshold.note,
        priority
      };
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

export function pnlForEntry(quote: Quote, entry: PortfolioEntry): { pnl: number; pnlPct: number } {
  return {
    pnl: (quote.current - entry.costPrice) * entry.shares,
    pnlPct: ((quote.current - entry.costPrice) / entry.costPrice) * 100
  };
}

export function riskLevel(quote: Quote, entry: PortfolioEntry): "urgent" | "warning" | "normal" | "opportunity" {
  if (entry.stopLoss !== undefined && quote.current <= entry.stopLoss) {
    return "urgent";
  }
  if (entry.stopLoss !== undefined && (quote.current - entry.stopLoss) / entry.stopLoss < 0.02) {
    return "warning";
  }
  if ((quote.current - entry.costPrice) / entry.costPrice > 0.05) {
    return "opportunity";
  }
  return "normal";
}

function thresholdsWithStopLoss(entry: PortfolioEntry): Threshold[] {
  const thresholds = [...(entry.thresholds ?? [])];
  if (entry.stopLoss !== undefined && !thresholds.some((threshold) => threshold.level === "stop")) {
    thresholds.unshift({ level: "stop", op: "<=", price: entry.stopLoss, note: "止损线" });
  }
  return thresholds;
}

function matches(current: number, threshold: Threshold, tolerancePrice: number): boolean {
  if (threshold.op === "<=") {
    return current <= threshold.price + tolerancePrice;
  }
  if (threshold.op === "<") {
    return current < threshold.price + tolerancePrice;
  }
  if (threshold.op === ">=") {
    return current >= threshold.price - tolerancePrice;
  }
  return current > threshold.price - tolerancePrice;
}

function priorityRank(priority: MatchedCondition["priority"]): number {
  return priority === "urgent" ? 0 : priority === "high" ? 1 : 2;
}
