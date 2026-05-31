import { describe, expect, it } from "vitest";
import { SinaQuoteClient } from "@integrations/stock/sina-quote-client.js";

describe.skipIf(process.env.RUN_LIVE_QUOTE_TEST !== "1")("SinaQuoteClient live", () => {
  it("fetches a real quote from Sina", async () => {
    const quotes = await new SinaQuoteClient().query(["sh600519"]);
    expect(quotes[0]?.stockCode).toBe("sh600519");
    expect(quotes[0]?.current).toBeGreaterThan(0);
  });
});
