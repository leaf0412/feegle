import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";
import iconv from "iconv-lite";
import { parseSinaResponse, SinaQuoteClient } from "../../src/stock/sina-quote-client.js";
import { QuoteFetchError, QuoteParseError } from "../../src/stock/stock-quote-port.js";

const fixture =
  'var hq_str_sh600519="贵州茅台,1750.00,1798.00,1810.50,1815.00,1790.00,1810.00,1811.00,12345,22345678.90,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-05-17,15:00:00,00";';

describe("parseSinaResponse", () => {
  it("parses Sina quote fields in expected input order", () => {
    expect(parseSinaResponse(fixture, ["sh600519"])).toEqual([
      {
        stockCode: "sh600519",
        name: "贵州茅台",
        open: 1750,
        prevClose: 1798,
        current: 1810.5,
        high: 1815,
        low: 1790,
        volume: 12345,
        amount: 22345678.9,
        at: new Date("2026-05-17T15:00:00+08:00")
      }
    ]);
  });

  it("rejects missing quote rows instead of returning partial data", () => {
    expect(() => parseSinaResponse(fixture, ["sh600519", "sz000001"])).toThrow(QuoteParseError);
  });
});

describe("SinaQuoteClient", () => {
  it("decodes GBK responses and maps them through the parser", async () => {
    const client = new SinaQuoteClient({
      fetchImpl: async () => {
        const body = new Uint8Array(iconv.encode(fixture, "gb18030"));
        return new Response(body, { status: 200 });
      }
    });

    await expect(client.query(["sh600519"])).resolves.toMatchObject([{ stockCode: "sh600519", name: "贵州茅台" }]);
  });

  it("surfaces network and HTTP failures as QuoteFetchError", async () => {
    const network = new SinaQuoteClient({
      fetchImpl: async () => {
        throw new Error("offline");
      }
    });
    await expect(network.query(["sh600519"])).rejects.toThrow(QuoteFetchError);

    const http = new SinaQuoteClient({
      fetchImpl: async () => new Response(new Uint8Array(Buffer.from("bad")), { status: 500 })
    });
    await expect(http.query(["sh600519"])).rejects.toThrow(QuoteFetchError);
  });
});
