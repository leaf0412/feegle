import { describe, expect, it } from "vitest";
import { FeishuMessageDedup, isAllowedByList, isOldMessage } from "../../src/integrations/feishu/feishu-dedup.js";

describe("FeishuMessageDedup", () => {
  it("marks duplicate message ids so handlers stay idempotent", () => {
    const dedup = new FeishuMessageDedup();

    expect(dedup.mark("om_1")).toBe(true);
    expect(dedup.mark("om_1")).toBe(false);
  });
});

describe("isAllowedByList", () => {
  it("allows everything by wildcard", () => {
    expect(isAllowedByList("*", "ou_1")).toBe(true);
  });

  it("matches comma separated values exactly", () => {
    expect(isAllowedByList("ou_1, ou_2", "ou_2")).toBe(true);
    expect(isAllowedByList("ou_1, ou_2", "ou_3")).toBe(false);
  });
});

describe("isOldMessage", () => {
  it("drops messages older than one minute to avoid replay storms", () => {
    expect(isOldMessage("1000", 62_000)).toBe(true);
    expect(isOldMessage("2000", 62_000)).toBe(false);
  });
});
