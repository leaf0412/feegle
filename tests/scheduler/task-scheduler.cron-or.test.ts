import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { HandlerKindRegistry } from "@features/scheduler/handler-kind-registry.js";
import { TaskRegistry } from "@features/scheduler/task-registry.js";
import { TaskScheduler } from "@features/scheduler/task-scheduler.js";
import type { HandlerKind } from "@features/scheduler/handler-kind.js";
import type { TaskStorePort } from "@features/scheduler/task-registry.js";
import type { Task } from "@features/scheduler/task.js";

describe("TaskScheduler runtime cron semantics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires when dom matches but dow does not (POSIX OR semantics)", async () => {
    // 2026-05-18 is a Monday in Asia/Shanghai.
    // Expression "30 23 18 * 0" = 23:30 on dom=18 OR dow=Sunday.
    // Under POSIX OR semantics this MUST fire at 23:30 today (dom=18 matches,
    // even though dow=Sunday does not — today is Monday).
    // The previous engine (node-cron) AND-combined dom & dow and silently
    // skipped this fire — this test pins the regression.
    vi.setSystemTime(new Date("2026-05-18T15:25:00.000Z")); // 23:25 Asia/Shanghai

    const fires: string[] = [];
    const scheduler = buildScheduler({
      task: makeTask("or-task", { cron: "30 23 18 * 0", timezone: "Asia/Shanghai" }),
      onRun: () => {
        fires.push(new Date().toISOString());
      }
    });

    await scheduler.start();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000); // advance 10 minutes
    await scheduler.stop();

    expect(fires).toEqual(["2026-05-18T15:30:00.000Z"]);
  });

  it("fires when dow matches but dom does not (POSIX OR semantics, other side)", async () => {
    // 2026-05-17 is a Sunday in Asia/Shanghai (dom=17, not 18).
    // Expression "30 23 18 * 0" should fire because dow=Sunday matches.
    vi.setSystemTime(new Date("2026-05-17T15:25:00.000Z")); // 23:25 Asia/Shanghai

    const fires: string[] = [];
    const scheduler = buildScheduler({
      task: makeTask("or-task-sun", { cron: "30 23 18 * 0", timezone: "Asia/Shanghai" }),
      onRun: () => {
        fires.push(new Date().toISOString());
      }
    });

    await scheduler.start();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await scheduler.stop();

    expect(fires).toEqual(["2026-05-17T15:30:00.000Z"]);
  });

  it("fires a vanilla daily expression on time", async () => {
    vi.setSystemTime(new Date("2026-05-18T00:55:00.000Z")); // 08:55 Asia/Shanghai

    const fires: string[] = [];
    const scheduler = buildScheduler({
      task: makeTask("daily", { cron: "0 9 * * *", timezone: "Asia/Shanghai" }),
      onRun: () => {
        fires.push(new Date().toISOString());
      }
    });

    await scheduler.start();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await scheduler.stop();

    expect(fires).toEqual(["2026-05-18T01:00:00.000Z"]);
  });
});

function makeTask(id: string, patch: Partial<Task> = {}): Task {
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
    lastErrorNotifiedAt: null,
    ...patch
  };
}

function buildScheduler(args: { task: Task; onRun: () => void }): TaskScheduler {
  const kind: HandlerKind<Record<string, never>> = {
    id: "heartbeat",
    title: "Heartbeat",
    description: "test",
    parseParams: () => ({}),
    describeParams: () => "none",
    run: async () => {
      args.onRun();
      return { outcome: "sent" };
    }
  };
  const registry = new TaskRegistry(memoryStore([args.task]));
  return new TaskScheduler({
    registry,
    kinds: new HandlerKindRegistry().register(kind),
    configStore: { get: () => ({ schemaVersion: 1, failureTarget: null }) },
    dedup: { checkAndMark: async () => true },
    runsLog: { append: async () => {} },
    notify: { sendText: async () => {}, sendCard: async () => {} },
    agents: new AgentProviderRegistry(),
    host: { read: async () => ({ hostname: "local", pid: 1 }) },
    clock: { now: () => new Date() },
    logger: silentLogger
  });
}

function memoryStore(seed: Task[]): TaskStorePort {
  const tasks = new Map(seed.map((task) => [task.id, task]));
  return {
    list: () => [...tasks.values()],
    upsert: async (task) => {
      tasks.set(task.id, task);
    },
    remove: async (id) => {
      tasks.delete(id);
    }
  };
}

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};
