import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import { HandlerKindRegistry } from "../../src/scheduler/handler-kind-registry.js";
import { TaskRegistry } from "../../src/scheduler/task-registry.js";
import { TaskScheduler } from "../../src/scheduler/task-scheduler.js";
import { UndeliveredFailureCounter } from "../../src/scheduler/undelivered-counter.js";
import type { HandlerKind } from "../../src/scheduler/handler-kind.js";
import type { Task } from "../../src/scheduler/task.js";

describe("TaskScheduler failure policy", () => {
  it("throttles on-change failures and sends one recovery card", async () => {
    const task = makeTask({ errorPolicy: "on-change" });
    const sentCards: unknown[] = [];
    const clock = mutableClock("2026-05-18T01:00:00.000Z");
    let shouldFail = true;
    const scheduler = makeScheduler(task, {
      clock,
      notify: { sendText: async () => {}, sendCard: async (_target, card) => { sentCards.push(card); } },
      kind: {
        run: async () => {
          if (shouldFail) throw new Error("boom");
          return { outcome: "noop" };
        }
      }
    });

    await expect(scheduler.runOnce(task.id)).rejects.toThrow("boom");
    clock.set("2026-05-18T01:05:00.000Z");
    await expect(scheduler.runOnce(task.id)).rejects.toThrow("boom");
    clock.set("2026-05-18T01:31:00.000Z");
    await expect(scheduler.runOnce(task.id)).rejects.toThrow("boom");
    shouldFail = false;
    clock.set("2026-05-18T01:40:00.000Z");
    await scheduler.runOnce(task.id);

    expect(sentCards).toHaveLength(3);
    expect(JSON.stringify(sentCards[0])).toContain("任务失败");
    expect(JSON.stringify(sentCards[2])).toContain("任务恢复");
  });

  it("counts undelivered failures when no failure target is configured", async () => {
    const task = makeTask({ errorPolicy: "always" });
    const counter = new UndeliveredFailureCounter();
    const scheduler = makeScheduler(task, {
      failureTarget: null,
      counter,
      kind: { run: async () => { throw new Error("boom"); } }
    });

    await expect(scheduler.runOnce(task.id)).rejects.toThrow("boom");

    expect(counter.get(task.id)).toBe(1);
  });
});

function makeScheduler(
  task: Task,
  options: {
    failureTarget?: { platform: "feishu"; chatId: string } | null;
    counter?: UndeliveredFailureCounter;
    clock?: ReturnType<typeof mutableClock>;
    notify?: { sendText(_target: unknown, _text: string): Promise<void>; sendCard(_target: unknown, _card: unknown): Promise<void> };
    kind: Partial<HandlerKind<Record<string, never>>>;
  }
) {
  const tasks: Task[] = [task];
  const registry = new TaskRegistry({
    list: () => tasks,
    upsert: async (updated) => {
      tasks[0] = updated;
    },
    remove: async () => {}
  });
  const kind: HandlerKind<Record<string, never>> = {
    id: "heartbeat",
    title: "Heartbeat",
    description: "test",
    parseParams: () => ({}),
    describeParams: () => "",
    run: async () => ({ outcome: "noop" }),
    ...options.kind
  };
  return new TaskScheduler({
    registry,
    configStore: {
      get: () => ({
        schemaVersion: 1,
        failureTarget:
          "failureTarget" in options ? options.failureTarget! : { platform: "feishu" as const, chatId: "oc_ops" }
      })
    },
    kinds: new HandlerKindRegistry().register(kind),
    dedup: { checkAndMark: async () => true },
    runsLog: { append: async () => {} },
    notify: options.notify ?? { sendText: async () => {}, sendCard: async () => {} },
    agents: new AgentProviderRegistry(),
    host: { read: async () => ({ hostname: "local", pid: 1 }) },
    clock: options.clock ?? mutableClock("2026-05-18T01:00:00.000Z"),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    undeliveredFailures: options.counter
  });
}

function makeTask(patch: Partial<Task> = {}): Task {
  return {
    id: "task-failure",
    name: "failure task",
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

function mutableClock(initial: string) {
  let now = new Date(initial);
  return {
    now: () => new Date(now),
    set: (value: string) => {
      now = new Date(value);
    }
  };
}
