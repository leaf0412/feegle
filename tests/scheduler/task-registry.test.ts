import { describe, expect, it } from "vitest";
import { TaskRegistry } from "../../src/scheduler/task-registry.js";
import type { TaskStorePort } from "../../src/scheduler/task-registry.js";
import type { Task } from "../../src/scheduler/task.js";

function makeTask(id: string): Task {
  return {
    id,
    name: id,
    kind: "heartbeat",
    params: {},
    cron: "0 9 * * *",
    timezone: "Asia/Shanghai",
    activeHours: null,
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
}

describe("TaskRegistry", () => {
  it("persists mutations and notifies scheduler observers after state changes", async () => {
    const saved: Task[] = [];
    const store: TaskStorePort = {
      list: () => [],
      upsert: async (task) => {
        saved.push(task);
      },
      remove: async () => {}
    };
    const registry = new TaskRegistry(store, () => new Date("2026-05-18T01:00:00.000Z"));
    const events: string[] = [];
    registry.subscribe({ onAdded: (task) => events.push(`add:${task.id}`), onUpdated: (task) => events.push(`update:${task.id}`), onRemoved: (id) => events.push(`remove:${id}`) });

    await registry.add(makeTask("01ABCDEFG"));
    await registry.update("01ABCDEFG", { name: "renamed" });
    await registry.remove("01ABCDEFG");

    expect(saved.map((task) => task.name)).toEqual(["01ABCDEFG", "renamed"]);
    expect(events).toEqual(["add:01ABCDEFG", "update:01ABCDEFG", "remove:01ABCDEFG"]);
  });

  it("finds tasks by id prefix for slash commands", async () => {
    const store: TaskStorePort = {
      list: () => [makeTask("01ABCDE"), makeTask("01XYZ")],
      upsert: async () => {},
      remove: async () => {}
    };
    const registry = new TaskRegistry(store);

    expect(registry.findByPrefix("01A").map((task) => task.id)).toEqual(["01ABCDE"]);
  });
});
