import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";
import type { StockCode } from "./stock-code.js";
import {
  StockStoreSchema,
  type PortfolioEntry,
  type PortfolioPatch,
  type PortfolioPosition,
  type Snapshot,
  type StockStoreData,
  type Subscription
} from "./stock-store-types.js";

const DEFAULT_STORE: StockStoreData = {
  schemaVersion: 1,
  subscriptions: [],
  portfolio: {},
  lastSnapshot: null
};

export class StockStore {
  private constructor(
    private readonly filePath: string,
    private data: StockStoreData,
    private readonly now: () => Date = () => new Date()
  ) {}

  static async load(home: string): Promise<StockStore> {
    const filePath = join(home, "stock-store.json");
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await createDefaultJsonFile(filePath, DEFAULT_STORE);
        raw = await readFile(filePath, "utf8");
      } else {
        throw error;
      }
    }
    try {
      return new StockStore(filePath, StockStoreSchema.parse(JSON.parse(raw)));
    } catch (error) {
      throw new Error(`Invalid stock-store.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  listSubscriptions(): readonly Subscription[] {
    return this.data.subscriptions.map((entry) => ({ ...entry }));
  }

  hasSubscription(code: StockCode): boolean {
    return this.data.subscriptions.some((entry) => entry.stockCode === code);
  }

  async addSubscriptions(
    codes: StockCode[],
    addedBy: string
  ): Promise<{ added: StockCode[]; alreadyPresent: StockCode[] }> {
    const added: StockCode[] = [];
    const alreadyPresent: StockCode[] = [];
    for (const code of codes) {
      if (this.hasSubscription(code)) {
        alreadyPresent.push(code);
        continue;
      }
      this.data.subscriptions.push({ stockCode: code, addedAt: this.now().toISOString(), addedBy });
      added.push(code);
    }
    if (added.length > 0) {
      await this.persist();
    }
    return { added, alreadyPresent };
  }

  async removeSubscriptions(codes: StockCode[]): Promise<{ removed: StockCode[]; missing: StockCode[] }> {
    const removed: StockCode[] = [];
    const missing: StockCode[] = [];
    for (const code of codes) {
      if (!this.hasSubscription(code)) {
        missing.push(code);
        continue;
      }
      this.data.subscriptions = this.data.subscriptions.filter((entry) => entry.stockCode !== code);
      removed.push(code);
    }
    if (removed.length > 0) {
      await this.persist();
    }
    return { removed, missing };
  }

  listPortfolio(): readonly PortfolioPosition[] {
    return Object.entries(this.data.portfolio).map(([stockCode, entry]) => ({
      stockCode,
      ...entry,
      thresholds: cloneThresholds(entry)
    }));
  }

  getPortfolio(code: StockCode): PortfolioEntry | undefined {
    const entry = this.data.portfolio[code];
    return entry ? { ...entry, thresholds: cloneThresholds(entry) } : undefined;
  }

  async setPortfolio(code: StockCode, patch: PortfolioPatch): Promise<PortfolioEntry> {
    const current = this.data.portfolio[code] ?? { shares: 0, costPrice: 1, updatedAt: this.now().toISOString() };
    const next = StockStoreSchema.shape.portfolio.element.parse({
      ...current,
      ...patch,
      updatedAt: this.now().toISOString()
    });
    this.data.portfolio[code] = next;
    await this.persist();
    return { ...next, thresholds: cloneThresholds(next) };
  }

  async unsetPortfolioField(code: StockCode, field: "stopLoss" | "thresholds"): Promise<PortfolioEntry> {
    const current = this.data.portfolio[code];
    if (!current) {
      throw new Error(`Portfolio entry not found: ${code}`);
    }
    const next = { ...current, updatedAt: this.now().toISOString() };
    delete next[field];
    this.data.portfolio[code] = next;
    await this.persist();
    return { ...next, thresholds: cloneThresholds(next) };
  }

  async clearPortfolio(code: StockCode): Promise<boolean> {
    const existed = this.data.portfolio[code] !== undefined;
    delete this.data.portfolio[code];
    if (existed) {
      await this.persist();
    }
    return existed;
  }

  async setSnapshot(snapshot: Snapshot): Promise<void> {
    this.data.lastSnapshot = { ...snapshot, rows: snapshot.rows.map((row) => ({ ...row })) };
    await this.persist();
  }

  getSnapshot(): Snapshot | null {
    return this.data.lastSnapshot
      ? { ...this.data.lastSnapshot, rows: this.data.lastSnapshot.rows.map((row) => ({ ...row })) }
      : null;
  }

  private async persist(): Promise<void> {
    await writeJsonAtomically(this.filePath, this.data);
  }
}

function cloneThresholds(entry: PortfolioEntry): PortfolioEntry["thresholds"] {
  return entry.thresholds?.map((threshold) => ({ ...threshold }));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
