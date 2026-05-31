import { describe, expect, it } from "vitest";
import { StockPortfolioSnapshotKind } from "../../../src/features/scheduler/kinds/stock-portfolio-snapshot-kind.js";
import { createTaskContext, makeTask, quote } from "./kind-test-helpers.js";

describe("StockPortfolioSnapshotKind", () => {
  it("writes a close snapshot and sends a summary card", async () => {
    const snapshots: unknown[] = [];
    const notify = recordingNotify();
    const kind = new StockPortfolioSnapshotKind({
      stockStore: {
        listPortfolio: () => [{ stockCode: "sh600519", shares: 100, costPrice: 1600, updatedAt: "now" }],
        getPortfolio: () => ({ shares: 100, costPrice: 1600, updatedAt: "now" }),
        setSnapshot: async (snapshot) => {
          snapshots.push(snapshot);
        }
      },
      quote: { query: async () => [quote({ current: 1700 })] }
    });

    await expect(
      kind.run(
        createTaskContext({ task: makeTask({ kind: "stock-portfolio-snapshot", target: { platform: "feishu", chatId: "oc_1" } }), notify }),
        kind.parseParams({})
      )
    ).resolves.toEqual({ outcome: "sent" });

    expect(JSON.stringify(snapshots[0])).toContain('"pnl":10000');
    expect(JSON.stringify(notify.cards[0])).toContain("收盘浮盈");
  });

  it("noops when there is no portfolio", async () => {
    const kind = new StockPortfolioSnapshotKind({
      stockStore: { listPortfolio: () => [], getPortfolio: () => undefined, setSnapshot: async () => {} },
      quote: { query: async () => [] }
    });

    await expect(
      kind.run(createTaskContext({ task: makeTask({ kind: "stock-portfolio-snapshot" }) }), kind.parseParams({}))
    ).resolves.toEqual({
      outcome: "noop",
      note: "no portfolio"
    });
  });
});

function recordingNotify() {
  return {
    cards: [] as unknown[],
    async sendText() {},
    async sendCard(_target: unknown, card: unknown) {
      this.cards.push(card);
    }
  };
}
