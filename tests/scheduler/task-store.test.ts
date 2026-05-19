import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TaskStore } from "../../src/scheduler/task-store.js";
import type { Task } from "../../src/scheduler/task.js";

function makeTask(id: string): Task {
  return {
    id,
    name: `task-${id}`,
    kind: "heartbeat",
    params: {},
    cron: "0 9 * * *",
    timezone: "Asia/Shanghai",
    activeHours: null,
    target: null,
    enabled: true,
    source: "seed",
    errorPolicy: "on-change",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z",
    lastRun: null,
    consecutiveFailures: 0,
    lastErrorNotifiedAt: null
  };
}

describe("TaskStore", () => {
  it("persists upserts and does not overwrite existing seed tasks", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-task-store-"));
    const store = await TaskStore.load(home);

    await store.ensureSeed([makeTask("01AAA")]);
    await store.upsert({ ...makeTask("01AAA"), name: "custom" });
    await store.ensureSeed([makeTask("01AAA"), makeTask("01BBB")]);

    const reloaded = await TaskStore.load(home);
    expect(reloaded.list().map((task) => task.name)).toEqual(["custom", "task-01BBB"]);
  });
});
