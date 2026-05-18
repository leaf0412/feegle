import { z } from "zod";
import { localDateString } from "../active-hours.js";
import type { HandlerKind, HandlerRunResult } from "../handler-kind.js";
import type { TaskContext } from "../task-context.js";
import type { QuoteClient } from "../../stock/stock-quote-port.js";
import type { StockCode } from "../../stock/stock-code.js";
import type { PortfolioEntry, Subscription } from "../../stock/stock-store-types.js";
import { matchThresholds } from "../../stock/stock-domain.js";
import { buildMonitorCard } from "./build-monitor-card.js";

const ParamsSchema = z
  .object({
    stocks: z.array(z.string()).optional(),
    tolerancePrice: z.number().nonnegative().default(0.02)
  })
  .default({});

type Params = z.infer<typeof ParamsSchema>;

export class StockMonitorKind implements HandlerKind<Params> {
  readonly id = "stock-monitor";
  readonly title = "Stock monitor";
  readonly description = "Monitors stock thresholds";

  constructor(
    private readonly deps: {
      stockStore: {
        listSubscriptions(): readonly Subscription[];
        getPortfolio(code: StockCode): PortfolioEntry | undefined;
      };
      quote: QuoteClient;
    }
  ) {}

  parseParams(input: unknown): Params {
    return ParamsSchema.parse(input);
  }

  describeParams(params: Params): string {
    return params.stocks?.join(",") ?? "all subscriptions";
  }

  async run(ctx: TaskContext, params: Params): Promise<HandlerRunResult> {
    const codes = (params.stocks as StockCode[] | undefined) ?? this.deps.stockStore.listSubscriptions().map((item) => item.stockCode);
    if (codes.length === 0) {
      return { outcome: "noop", note: "no subscriptions" };
    }
    const quotes = await this.deps.quote.query(codes);
    const matches = quotes.flatMap((quote) => {
      const entry = this.deps.stockStore.getPortfolio(quote.stockCode);
      return entry ? matchThresholds(quote, entry, params.tolerancePrice) : [];
    });
    const dateInTz = localDateString(ctx.now, ctx.task.timezone);
    const toReport = [];
    for (const match of matches) {
      if (await ctx.dedup.checkAndMark(ctx.task.id, match.conditionKey, dateInTz)) {
        toReport.push(match);
      }
    }
    if (toReport.length === 0) {
      return { outcome: "silent", note: "no new conditions" };
    }
    if (!ctx.task.target) {
      return { outcome: "silent", note: "matched but no target" };
    }
    await ctx.notify.sendCard(ctx.task.target, buildMonitorCard(toReport, quotes, ctx.task.id));
    return { outcome: "sent", note: `${toReport.length} conditions` };
  }
}
