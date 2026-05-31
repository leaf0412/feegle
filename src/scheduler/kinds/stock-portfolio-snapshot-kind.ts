import { z } from "zod";
import type { HandlerKind, HandlerRunResult } from "../handler-kind.js";
import type { TaskContext } from "../task-context.js";
import type { QuoteClient } from "../../integrations/stock/stock-quote-port.js";
import type { PortfolioEntry, PortfolioPosition, Snapshot } from "../../integrations/stock/stock-store-types.js";
import type { StockCode } from "../../integrations/stock/stock-code.js";
import { pnlForEntry } from "../../integrations/stock/stock-domain.js";
import { buildSnapshotCard } from "./build-snapshot-card.js";

const ParamsSchema = z.object({}).default({});

export class StockPortfolioSnapshotKind implements HandlerKind<Record<string, never>> {
  readonly id = "stock-portfolio-snapshot";
  readonly title = "Stock portfolio snapshot";
  readonly description = "Snapshots portfolio PnL";

  constructor(
    private readonly deps: {
      stockStore: {
        listPortfolio(): readonly PortfolioPosition[];
        getPortfolio(code: StockCode): PortfolioEntry | undefined;
        setSnapshot(snapshot: Snapshot): Promise<void>;
      };
      quote: QuoteClient;
    }
  ) {}

  parseParams(input: unknown): Record<string, never> {
    return ParamsSchema.parse(input);
  }

  describeParams(): string {
    return "no params";
  }

  async run(ctx: TaskContext, _params: Record<string, never>): Promise<HandlerRunResult> {
    const portfolio = this.deps.stockStore.listPortfolio();
    if (portfolio.length === 0) {
      return { outcome: "noop", note: "no portfolio" };
    }
    const quotes = await this.deps.quote.query(portfolio.map((entry) => entry.stockCode));
    const rows = quotes.map((quote) => {
      const entry = this.deps.stockStore.getPortfolio(quote.stockCode);
      if (!entry) {
        throw new Error(`Missing portfolio entry for ${quote.stockCode}`);
      }
      const pnl = pnlForEntry(quote, entry);
      return { stockCode: quote.stockCode, lastClose: quote.current, ...pnl };
    });
    const snapshot = { at: ctx.now.toISOString(), rows };
    await this.deps.stockStore.setSnapshot(snapshot);
    if (!ctx.task.target) {
      return { outcome: "silent", note: "snapshot saved but no target" };
    }
    await ctx.notify.sendCard(ctx.task.target, buildSnapshotCard(snapshot));
    return { outcome: "sent" };
  }
}
