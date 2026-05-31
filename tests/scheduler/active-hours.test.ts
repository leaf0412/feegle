import { describe, expect, it } from "vitest";
import { withinActiveHours } from "@features/scheduler/active-hours.js";
import type { Task } from "@features/scheduler/task.js";

const task: Task = {
  id: "01",
  name: "market",
  kind: "heartbeat",
  params: {},
  cron: "*/5 * * * *",
  timezone: "Asia/Shanghai",
  activeHours: ["09:25-11:30", "13:00-15:00"],
  target: null,
  enabled: true,
  source: "user",
  errorPolicy: "on-change",
  createdAt: "2026-05-18T00:00:00.000Z",
  updatedAt: "2026-05-18T00:00:00.000Z",
  lastRun: null,
  consecutiveFailures: 0,
  lastErrorNotifiedAt: null
};

describe("withinActiveHours", () => {
  it("uses the task timezone wall clock to gate cron ticks", () => {
    expect(withinActiveHours(task, new Date("2026-05-18T01:30:00.000Z"))).toBe(true);
    expect(withinActiveHours(task, new Date("2026-05-18T04:00:00.000Z"))).toBe(false);
  });

  it("rejects cross-day ranges instead of guessing market semantics", () => {
    expect(() => withinActiveHours({ ...task, activeHours: ["22:00-06:00"] }, new Date())).toThrow(
      /Cross-day activeHours/
    );
  });
});
