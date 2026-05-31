import { describe, expect, it } from "vitest";
import { matchThresholds, pnlForEntry, riskLevel } from "../../src/integrations/stock/stock-domain.js";
import type { PortfolioEntry } from "../../src/integrations/stock/stock-store-types.js";
import type { Quote } from "../../src/integrations/stock/stock-quote-port.js";

const quote: Quote = {
  stockCode: "sh600519",
  name: "贵州茅台",
  current: 1650,
  open: 1700,
  prevClose: 1710,
  high: 1720,
  low: 1648,
  volume: 1000,
  amount: 1_650_000,
  at: new Date("2026-05-18T15:00:00+08:00")
};

const entry: PortfolioEntry = {
  shares: 100,
  costPrice: 1600,
  stopLoss: 1650,
  thresholds: [{ level: "trend", op: ">=", price: 1800, note: "趋势确认" }],
  updatedAt: "2026-05-18T01:00:00.000Z"
};

describe("stock-domain", () => {
  it("injects stopLoss as an urgent threshold when no explicit stop threshold exists", () => {
    expect(matchThresholds(quote, entry)).toEqual([
      {
        stockCode: "sh600519",
        level: "stop",
        conditionKey: "sh600519:stop",
        op: "<=",
        price: 1650,
        current: 1650,
        note: "止损线",
        priority: "urgent"
      }
    ]);
  });

  it("calculates floating PnL from quote, cost, and shares", () => {
    expect(pnlForEntry(quote, entry)).toEqual({ pnl: 5000, pnlPct: 3.125 });
  });

  it("classifies stop-loss proximity before opportunity", () => {
    expect(riskLevel(quote, entry)).toBe("urgent");
    expect(riskLevel({ ...quote, current: 1660 }, entry)).toBe("warning");
    expect(riskLevel({ ...quote, current: 1700 }, entry)).toBe("opportunity");
  });
});
