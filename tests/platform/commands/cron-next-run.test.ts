import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextRunDescription } from "../../../src/platform/commands/cron/cron-command-handlers.js";

describe("nextRunDescription", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats dom and dow as OR when both are restricted (POSIX semantics)", () => {
    // `0 9 1 * 1` should fire on day-of-month=1 OR day-of-week=Monday at 09:00.
    // Starting from 2026-05-01T00:00:00Z, the next three fires in Asia/Shanghai
    // (UTC+8) should be:
    //   2026-05-01 09:00 CST  (1st of month, Friday)        -> 01:00 UTC
    //   2026-05-04 09:00 CST  (Monday)                      -> 01:00 UTC
    //   2026-05-11 09:00 CST  (Monday)                      -> 01:00 UTC
    // The old buggy AND implementation would only match days that are BOTH
    // the 1st AND a Monday, missing 5/1 and 5/4.
    const start = new Date("2026-05-01T00:00:00Z");
    const first = nextRunDescription("0 9 1 * 1", "Asia/Shanghai", start);
    expect(first).toBe("2026-05-01T01:00:00.000Z");

    const afterFirst = new Date("2026-05-01T01:00:00.001Z");
    const second = nextRunDescription("0 9 1 * 1", "Asia/Shanghai", afterFirst);
    expect(second).toBe("2026-05-04T01:00:00.000Z");

    const afterSecond = new Date("2026-05-04T01:00:00.001Z");
    const third = nextRunDescription("0 9 1 * 1", "Asia/Shanghai", afterSecond);
    expect(third).toBe("2026-05-11T01:00:00.000Z");
  });

  it("computes daily expressions correctly with timezone", () => {
    const start = new Date("2026-05-18T00:00:00Z");
    expect(nextRunDescription("0 9 * * *", "Asia/Shanghai", start)).toBe(
      "2026-05-18T01:00:00.000Z"
    );
  });

  it("computes monthly-only expressions (dow=*) correctly", () => {
    // `30 8 15 * *` -> 15th of each month at 08:30, no dow restriction
    const start = new Date("2026-05-18T00:00:00Z");
    expect(nextRunDescription("30 8 15 * *", "Asia/Shanghai", start)).toBe(
      "2026-06-15T00:30:00.000Z"
    );
  });

  it("surfaces parse errors instead of returning 'unknown' or 'invalid-cron'", () => {
    const result = nextRunDescription("not a valid cron", "Asia/Shanghai", new Date("2026-05-18T00:00:00Z"));
    expect(result).toMatch(/^ERROR\(.+\)$/);
    expect(result).not.toBe("unknown");
    expect(result).not.toBe("invalid-cron");
  });

  it("logs a warning when parsing fails (errors are surfaced, not silently swallowed)", () => {
    const warnSpy = vi.spyOn(console, "warn");
    nextRunDescription("99 99 99 99 99", "Asia/Shanghai", new Date("2026-05-18T00:00:00Z"));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0]?.[0];
    expect(String(message)).toContain("cron=99 99 99 99 99");
    expect(String(message)).toContain("tz=Asia/Shanghai");
  });
});
