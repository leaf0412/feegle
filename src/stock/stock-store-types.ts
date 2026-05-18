import { z } from "zod";

export const StockCodeSchema = z.string().regex(/^(sh|sz)\d{6}$/);

export const ThresholdSchema = z.object({
  level: z.string().min(1),
  op: z.enum(["<=", ">=", "<", ">"]),
  price: z.number().positive(),
  note: z.string().min(1)
});

export const PortfolioEntrySchema = z.object({
  name: z.string().min(1).optional(),
  shares: z.number().int().nonnegative(),
  costPrice: z.number().positive(),
  stopLoss: z.number().positive().optional(),
  thresholds: z.array(ThresholdSchema).optional(),
  updatedAt: z.string()
});

export const SubscriptionSchema = z.object({
  stockCode: StockCodeSchema,
  addedAt: z.string(),
  addedBy: z.string().min(1)
});

export const SnapshotRowSchema = z.object({
  stockCode: StockCodeSchema,
  lastClose: z.number().positive(),
  pnl: z.number(),
  pnlPct: z.number()
});

export const SnapshotSchema = z.object({
  at: z.string(),
  rows: z.array(SnapshotRowSchema)
});

export const StockStoreSchema = z.object({
  schemaVersion: z.literal(1),
  subscriptions: z.array(SubscriptionSchema),
  portfolio: z.record(StockCodeSchema, PortfolioEntrySchema),
  lastSnapshot: SnapshotSchema.nullable()
});

export type Threshold = z.infer<typeof ThresholdSchema>;
export type PortfolioEntry = z.infer<typeof PortfolioEntrySchema>;
export type PortfolioPosition = PortfolioEntry & { stockCode: string };
export type PortfolioPatch = Partial<Omit<PortfolioEntry, "updatedAt">>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type StockStoreData = z.infer<typeof StockStoreSchema>;
