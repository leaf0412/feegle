import { z } from "zod";
import type { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { collectText } from "@integrations/agent/collect-text.js";
import type { QuoteClient } from "@integrations/stock/stock-quote-port.js";
import type { PortfolioPosition } from "@integrations/stock/stock-store-types.js";
import { riskLevel } from "@integrations/stock/stock-domain.js";
import { AgentRunError, UnknownProviderError } from "../handler-errors.js";
import type { HandlerKind, HandlerRunResult } from "../handler-kind.js";
import type { TaskContext } from "../task-context.js";

const defaultAdvisorPrompt = `你是专业的 A 股操作顾问。下面是用户当前持仓和实时行情：\n\n{{CONTEXT}}\n\n请给出每只股票当下的操作建议。`;

const ParamsSchema = z
  .object({
    provider: z.enum(["claude", "codex"]).default("claude"),
    promptTemplate: z.string().default(defaultAdvisorPrompt),
    occasion: z.enum(["open", "mid-morning", "mid-afternoon", "pre-close"]).default("open")
  })
  .default({});

type Params = z.infer<typeof ParamsSchema>;

export class StockAdvisorKind implements HandlerKind<Params> {
  readonly id = "stock-advisor";
  readonly title = "Stock advisor";
  readonly description = "Asks an agent for stock advice";

  constructor(
    private readonly deps: {
      stockStore: { listPortfolio(): readonly PortfolioPosition[] };
      quote: QuoteClient;
      agents: AgentProviderRegistry;
    }
  ) {}

  parseParams(input: unknown): Params {
    return ParamsSchema.parse(input);
  }

  describeParams(params: Params): string {
    return `${params.provider}/${params.occasion}`;
  }

  async run(ctx: TaskContext, params: Params): Promise<HandlerRunResult> {
    const portfolio = this.deps.stockStore.listPortfolio();
    if (portfolio.length === 0) {
      return { outcome: "noop", note: "no portfolio" };
    }
    const quotes = await this.deps.quote.query(portfolio.map((entry) => entry.stockCode));
    const context = portfolio
      .map((entry) => {
        const quote = quotes.find((item) => item.stockCode === entry.stockCode);
        return `${entry.stockCode} 成本:${entry.costPrice} 持仓:${entry.shares} 当前:${quote?.current ?? "N/A"} 风险:${quote ? riskLevel(quote, entry) : "unknown"}`;
      })
      .join("\n");
    const provider = this.deps.agents.resolve(params.provider);
    if (!provider) {
      throw new UnknownProviderError(`Unknown provider: ${params.provider}`);
    }
    let response: string;
    try {
      response = await collectText(
        provider.buildAgent(),
        params.promptTemplate.replace("{{CONTEXT}}", context)
      );
    } catch (error) {
      throw new AgentRunError(params.provider, error);
    }
    if (!ctx.task.target) {
      return { outcome: "silent", note: "no target" };
    }
    await ctx.notify.sendText(ctx.task.target, response);
    return { outcome: "sent" };
  }
}
