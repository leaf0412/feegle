import { createPlatformCard, type PlatformCard } from "../../platform/platform-card.js";
import type { Snapshot } from "../../integrations/stock/stock-store-types.js";

export function buildSnapshotCard(snapshot: Snapshot): PlatformCard {
  const totalPnl = snapshot.rows.reduce((sum, row) => sum + row.pnl, 0);
  const rows = snapshot.rows.map(
    (row) => `${row.stockCode} ¥${row.lastClose.toFixed(2)} ${formatSigned(row.pnl)} (${row.pnlPct.toFixed(2)}%)`
  );
  return createPlatformCard()
    .title("收盘浮盈", totalPnl >= 0 ? "green" : "red")
    .markdown(`总浮盈: ${formatSigned(totalPnl)}\n\n${rows.join("\n")}`)
    .build();
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : "-"}¥${Math.abs(value).toFixed(2)}`;
}
