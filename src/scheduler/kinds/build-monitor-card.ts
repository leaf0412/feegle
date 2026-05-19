import { createPlatformCard, type PlatformCard } from "../../platform/platform-card.js";
import type { MatchedCondition } from "../../stock/stock-domain.js";
import type { Quote } from "../../stock/stock-quote-port.js";

export function buildMonitorCard(matches: MatchedCondition[], quotes: Quote[], taskId: string): PlatformCard {
  const quoteByCode = new Map(quotes.map((quote) => [quote.stockCode, quote]));
  const lines = matches.map((match) => {
    const quote = quoteByCode.get(match.stockCode);
    const name = quote?.name ? ` ${quote.name}` : "";
    return `**${match.stockCode}${name}** - ${match.note} ¥${match.current.toFixed(2)} (阈值 ¥${match.price.toFixed(2)})`;
  });
  return createPlatformCard()
    .title("股价预警", "red")
    .markdown(`task: ${taskId}\n\n${lines.join("\n")}`)
    .build();
}
