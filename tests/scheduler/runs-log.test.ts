import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RunsLog } from "@features/scheduler/runs-log.js";

describe("RunsLog", () => {
  it("appends JSONL and returns newest matching entries first for history", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-runs-"));
    const log = await RunsLog.open(home);

    await log.append({ taskId: "a", kind: "heartbeat", at: "2026-05-18T01:00:00.000Z", outcome: "ok", durationMs: 1 });
    await log.append({ taskId: "b", kind: "heartbeat", at: "2026-05-18T02:00:00.000Z", outcome: "failed", durationMs: 2, note: "boom" });
    await log.append({ taskId: "a", kind: "heartbeat", at: "2026-05-18T03:00:00.000Z", outcome: "noop", durationMs: 3 });

    const entries = [];
    for await (const entry of log.tailReverse({ taskId: "a", limit: 2 })) {
      entries.push(entry);
    }

    expect(entries.map((entry) => entry.at)).toEqual([
      "2026-05-18T03:00:00.000Z",
      "2026-05-18T01:00:00.000Z"
    ]);
  });
});
