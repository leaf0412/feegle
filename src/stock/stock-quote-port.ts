import type { StockCode } from "./stock-code.js";

export interface Quote {
  stockCode: StockCode;
  name: string;
  current: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  at: Date;
}

export class QuoteFetchError extends Error {
  readonly errorClass = "QuoteFetchError";

  constructor(
    public readonly url: string,
    public readonly cause: unknown
  ) {
    super(`Quote fetch failed: ${url}`);
  }
}

export class QuoteParseError extends Error {
  readonly errorClass = "QuoteParseError";

  constructor(
    public readonly snippet: string,
    public readonly cause?: unknown
  ) {
    super(`Quote parse failed: ${snippet.slice(0, 80)}`);
  }
}

export interface QuoteClient {
  query(codes: StockCode[]): Promise<Quote[]>;
}
