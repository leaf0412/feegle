import { describe, expect, it } from "vitest";
import { decideShouldNotifyFailure } from "../../src/scheduler/failure-policy.js";

describe("decideShouldNotifyFailure", () => {
  const now = new Date("2026-05-18T02:00:00.000Z");

  it("notifies every failure for always policy", () => {
    expect(decideShouldNotifyFailure("always", 2, "2026-05-18T01:59:00.000Z", now)).toBe(true);
  });

  it("never notifies for silent policy", () => {
    expect(decideShouldNotifyFailure("silent", 1, null, now)).toBe(false);
  });

  it("notifies first on-change failure and throttles repeated failures for 30 minutes", () => {
    expect(decideShouldNotifyFailure("on-change", 1, null, now)).toBe(true);
    expect(decideShouldNotifyFailure("on-change", 2, "2026-05-18T01:45:00.000Z", now)).toBe(false);
    expect(decideShouldNotifyFailure("on-change", 2, "2026-05-18T01:29:59.000Z", now)).toBe(true);
  });
});
