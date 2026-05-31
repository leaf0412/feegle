import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { StockStore } from "../../src/integrations/stock/stock-store.js";

describe("StockStore", () => {
  it("deduplicates subscriptions and keeps portfolio patches narrow", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-stock-"));
    const store = await StockStore.load(home);

    await expect(store.addSubscriptions(["sh600519", "sh600519"], "feishu:ou_1")).resolves.toEqual({
      added: ["sh600519"],
      alreadyPresent: ["sh600519"]
    });
    await store.setPortfolio("sh600519", { shares: 100, costPrice: 1600 });
    await store.setPortfolio("sh600519", { stopLoss: 1500 });
    await store.unsetPortfolioField("sh600519", "stopLoss");

    const reloaded = await StockStore.load(home);
    expect(reloaded.listSubscriptions().map((entry) => entry.stockCode)).toEqual(["sh600519"]);
    expect(reloaded.getPortfolio("sh600519")).toMatchObject({ shares: 100, costPrice: 1600 });
    expect(reloaded.getPortfolio("sh600519")?.stopLoss).toBeUndefined();
  });

  it("rejects incompatible schema versions rather than silently changing user data", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-stock-"));
    await writeFile(join(home, "stock-store.json"), JSON.stringify({ schemaVersion: 2 }));

    await expect(StockStore.load(home)).rejects.toThrow(/stock-store.json/);
  });
});
