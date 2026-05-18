import { describe, expect, it } from "vitest";
import { InvalidStockCodeError, normalizeStockCode } from "../../src/stock/stock-code.js";

describe("normalizeStockCode", () => {
  it.each([
    [" sh600519 ", "sh600519"],
    ["SZ002611", "sz002611"],
    ["600519.sh", "sh600519"],
    ["002611.sz", "sz002611"],
    ["600519", "sh600519"],
    ["000001", "sz000001"],
    ["300750", "sz300750"],
    ["sz600519", "sz600519"]
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeStockCode(input)).toBe(expected);
  });

  it.each(["12345", "700001", "hk00700", "shABCDEF"])("rejects ambiguous or malformed code %s", (input) => {
    expect(() => normalizeStockCode(input)).toThrow(InvalidStockCodeError);
  });
});
