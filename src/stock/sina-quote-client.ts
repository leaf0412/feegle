import { Buffer } from "node:buffer";
import iconv from "iconv-lite";
import type { StockCode } from "./stock-code.js";
import { QuoteFetchError, QuoteParseError, type Quote, type QuoteClient } from "./stock-quote-port.js";

export class SinaQuoteClient implements QuoteClient {
  constructor(private readonly opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {}

  async query(codes: StockCode[]): Promise<Quote[]> {
    if (codes.length === 0) {
      return [];
    }
    const url = `https://hq.sinajs.cn/list=${codes.join(",")}`;
    let response: Response;
    try {
      response = await (this.opts.fetchImpl ?? fetch)(url, {
        headers: { Referer: "https://finance.sina.com.cn" },
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 5000)
      });
    } catch (cause) {
      throw new QuoteFetchError(url, cause);
    }
    if (!response.ok) {
      throw new QuoteFetchError(url, new Error(`HTTP ${response.status}`));
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return parseSinaResponse(iconv.decode(buffer, "gb18030"), codes);
  }
}

export function parseSinaResponse(text: string, expectedCodes: StockCode[]): Quote[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (rows.length !== expectedCodes.length) {
    throw new QuoteParseError(text);
  }
  return rows.map((row, index) => parseRow(row, expectedCodes[index]));
}

function parseRow(row: string, expectedCode: StockCode): Quote {
  const match = /^var hq_str_(\w+)="([^"]*)";?$/.exec(row);
  if (!match) {
    throw new QuoteParseError(row);
  }
  const [, code, body] = match;
  if (code !== expectedCode) {
    throw new QuoteParseError(row, new Error(`Expected ${expectedCode}, got ${code}`));
  }
  const fields = body.split(",");
  if (fields.length < 32) {
    throw new QuoteParseError(row, new Error("Expected at least 32 fields"));
  }
  return {
    stockCode: code,
    name: fields[0],
    open: readNumber(fields, 1, row),
    prevClose: readNumber(fields, 2, row),
    current: readNumber(fields, 3, row),
    high: readNumber(fields, 4, row),
    low: readNumber(fields, 5, row),
    volume: readNumber(fields, 8, row),
    amount: readNumber(fields, 9, row),
    at: new Date(`${fields[30]}T${fields[31]}+08:00`)
  };
}

function readNumber(fields: string[], index: number, row: string): number {
  const value = Number.parseFloat(fields[index] ?? "");
  if (Number.isNaN(value)) {
    throw new QuoteParseError(row, new Error(`Invalid numeric field ${index}`));
  }
  return value;
}
