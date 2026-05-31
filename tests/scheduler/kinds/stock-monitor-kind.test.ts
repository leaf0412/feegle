import { describe, expect, it } from "vitest";
import { StockMonitorKind } from "../../../src/scheduler/kinds/stock-monitor-kind.js";
import { QuoteFetchError } from "../../../src/integrations/stock/stock-quote-port.js";
import { createTaskContext, makeTask, quote } from "./kind-test-helpers.js";

describe("StockMonitorKind", () => {
  it("sends new threshold matches and marks daily dedup keys", async () => {
    const notify = recordingNotify();
    const marked: string[] = [];
    const kind = new StockMonitorKind({
      stockStore: {
        listSubscriptions: () => [{ stockCode: "sh600519", addedAt: "now", addedBy: "owner" }],
        getPortfolio: () => ({ shares: 100, costPrice: 1700, stopLoss: 1650, updatedAt: "now" })
      },
      quote: { query: async () => [quote({ current: 1649 })] }
    });
    const ctx = createTaskContext({
      task: makeTask({ kind: "stock-monitor", target: { platform: "feishu", chatId: "oc_1" } }),
      notify,
      dedup: {
        checkAndMark: async (_taskId, conditionKey) => {
          marked.push(conditionKey);
          return true;
        }
      }
    });

    await expect(kind.run(ctx, kind.parseParams({}))).resolves.toMatchObject({ outcome: "sent" });

    expect(marked).toEqual(["sh600519:stop"]);
    expect(JSON.stringify(notify.cards[0])).toContain("股价预警");
  });

  it("stays silent for same-day duplicate matches", async () => {
    const kind = new StockMonitorKind({
      stockStore: {
        listSubscriptions: () => [{ stockCode: "sh600519", addedAt: "now", addedBy: "owner" }],
        getPortfolio: () => ({ shares: 100, costPrice: 1700, stopLoss: 1650, updatedAt: "now" })
      },
      quote: { query: async () => [quote({ current: 1649 })] }
    });
    const ctx = createTaskContext({
      task: makeTask({ kind: "stock-monitor", target: { platform: "feishu", chatId: "oc_1" } }),
      dedup: { checkAndMark: async () => false }
    });

    await expect(kind.run(ctx, kind.parseParams({}))).resolves.toEqual({ outcome: "silent", note: "no new conditions" });
  });

  it("surfaces quote failures", async () => {
    const error = new QuoteFetchError("url", new Error("offline"));
    const kind = new StockMonitorKind({
      stockStore: {
        listSubscriptions: () => [{ stockCode: "sh600519", addedAt: "now", addedBy: "owner" }],
        getPortfolio: () => undefined
      },
      quote: { query: async () => { throw error; } }
    });

    await expect(kind.run(createTaskContext({ task: makeTask({ kind: "stock-monitor" }) }), kind.parseParams({}))).rejects.toBe(error);
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
