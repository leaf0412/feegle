import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { HandlerKindRegistry } from "@features/scheduler/handler-kind-registry.js";
import { TaskRegistry } from "@features/scheduler/task-registry.js";
import { TaskScheduler } from "@features/scheduler/task-scheduler.js";
import type { HandlerKind } from "@features/scheduler/handler-kind.js";
import type { TaskStorePort } from "@features/scheduler/task-registry.js";
import type { Task } from "@features/scheduler/task.js";
import type { RunsLogEntry } from "@features/scheduler/runs-log.js";

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

describe("TaskScheduler", () => {
  it("records successful runOnce outcomes in task state and history", async () => {
    const task = makeTask("task-ok");
    const written: Task[] = [];
    const history: RunsLogEntry[] = [];
    const registry = new TaskRegistry(memoryStore([task], written));
    const kind: HandlerKind<Record<string, never>> = {
      id: "heartbeat",
      title: "Heartbeat",
      description: "test",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => ({ outcome: "sent", note: "sent heartbeat" })
    };
    const scheduler = new TaskScheduler({
      registry,
      kinds: new HandlerKindRegistry().register(kind),
      configStore: { get: () => ({ schemaVersion: 1, failureTarget: null }) },
      dedup: { checkAndMark: async () => true },
      runsLog: { append: async (entry) => {
        history.push(entry);
      } },
      notify: { sendText: async () => {}, sendCard: async () => {} },
      agents: new AgentProviderRegistry(),
      host: { read: async () => ({ hostname: "local", pid: 1 }) },
      clock: { now: () => new Date("2026-05-18T01:00:00.000Z") },
      logger: silentLogger
    });

    await expect(scheduler.runOnce("task-ok")).resolves.toMatchObject({ status: "ok", note: "sent heartbeat" });

    expect(written.at(-1)?.lastRun?.status).toBe("ok");
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ taskId: "task-ok", outcome: "ok" });
  });

  it("records failures and rethrows runOnce errors to command callers", async () => {
    const task = makeTask("task-fail");
    const written: Task[] = [];
    const history: RunsLogEntry[] = [];
    const registry = new TaskRegistry(memoryStore([task], written));
    const kind: HandlerKind<Record<string, never>> = {
      id: "heartbeat",
      title: "Heartbeat",
      description: "test",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => {
        throw new Error("boom");
      }
    };
    const scheduler = new TaskScheduler({
      registry,
      kinds: new HandlerKindRegistry().register(kind),
      configStore: { get: () => ({ schemaVersion: 1, failureTarget: null }) },
      dedup: { checkAndMark: async () => true },
      runsLog: { append: async (entry) => {
        history.push(entry);
      } },
      notify: { sendText: async () => {}, sendCard: async () => {} },
      agents: new AgentProviderRegistry(),
      host: { read: async () => ({ hostname: "local", pid: 1 }) },
      clock: { now: () => new Date("2026-05-18T01:00:00.000Z") },
      logger: silentLogger
    });

    await expect(scheduler.runOnce("task-fail")).rejects.toThrow("boom");

    expect(written.at(-1)?.lastRun?.status).toBe("failed");
    expect(written.at(-1)?.consecutiveFailures).toBe(1);
    expect(history[0]).toMatchObject({ taskId: "task-fail", outcome: "failed", note: "boom" });
  });

  it("notifies runtime observer before executing a scheduled task", async () => {
    const task = makeTask("task-observed");
    const registry = new TaskRegistry(memoryStore([task], []));
    const calls: string[] = [];
    const kind: HandlerKind<Record<string, never>> = {
      id: "heartbeat",
      title: "Heartbeat",
      description: "test",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => {
        calls.push("handler");
        return { outcome: "sent" };
      }
    };
    const scheduler = new TaskScheduler({
      registry,
      kinds: new HandlerKindRegistry().register(kind),
      configStore: { get: () => ({ schemaVersion: 1, failureTarget: null }) },
      dedup: { checkAndMark: async () => true },
      runsLog: { append: async () => {} },
      notify: { sendText: async () => {}, sendCard: async () => {} },
      agents: new AgentProviderRegistry(),
      host: { read: async () => ({ hostname: "local", pid: 1 }) },
      clock: { now: () => new Date("2026-05-18T01:00:00.000Z") },
      logger: silentLogger,
      runtimeObserver: {
        beforeTaskRun: async () => {
          calls.push("runtime");
        }
      }
    });

    await scheduler.runOnce("task-observed");

    expect(calls).toEqual(["runtime", "handler"]);
  });

  it("routes supported kind through workflow runner and skips legacy handler", async () => {
    const task = makeTask("task-runtime");
    const registry = new TaskRegistry(memoryStore([task], []));
    const calls: string[] = [];
    const kind: HandlerKind<Record<string, never>> = {
      id: "heartbeat",
      title: "Heartbeat",
      description: "test",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => {
        calls.push("legacy-handler");
        return { outcome: "sent" };
      }
    };
    const scheduler = new TaskScheduler({
      registry,
      kinds: new HandlerKindRegistry().register(kind),
      configStore: { get: () => ({ schemaVersion: 1, failureTarget: null }) },
      dedup: { checkAndMark: async () => true },
      runsLog: { append: async () => {} },
      notify: { sendText: async () => {}, sendCard: async () => {} },
      agents: new AgentProviderRegistry(),
      host: { read: async () => ({ hostname: "local", pid: 1 }) },
      clock: { now: () => new Date("2026-05-18T01:00:00.000Z") },
      logger: silentLogger,
      workflowRunner: {
        startScheduledTask: async () => {
          calls.push("workflow-runner");
          return { status: "succeeded" };
        }
      }
    });

    await scheduler.runOnce("task-runtime");

    expect(calls).toEqual(["workflow-runner"]);
  });

  it("routes all kinds through workflow runner when available (not just RUNTIME_NATIVE_KINDS)", async () => {
    const task = makeTask("task-legacy", { kind: "stock-monitor" });
    const registry = new TaskRegistry(memoryStore([task], []));
    const calls: string[] = [];
    const kind: HandlerKind<Record<string, never>> = {
      id: "stock-monitor",
      title: "Stock Monitor",
      description: "test",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => {
        calls.push("legacy-handler");
        return { outcome: "sent" };
      }
    };
    const scheduler = new TaskScheduler({
      registry,
      kinds: new HandlerKindRegistry().register(kind),
      configStore: { get: () => ({ schemaVersion: 1, failureTarget: null }) },
      dedup: { checkAndMark: async () => true },
      runsLog: { append: async () => {} },
      notify: { sendText: async () => {}, sendCard: async () => {} },
      agents: new AgentProviderRegistry(),
      host: { read: async () => ({ hostname: "local", pid: 1 }) },
      clock: { now: () => new Date("2026-05-18T01:00:00.000Z") },
      logger: silentLogger,
      workflowRunner: {
        startScheduledTask: async () => {
          calls.push("workflow-runner");
          return { status: "succeeded" };
        }
      }
    });

    await scheduler.runOnce("task-legacy");

    // All kinds route through workflow runner when available (RUNTIME_NATIVE_KINDS removed in Plan 62)
    expect(calls).toEqual(["workflow-runner"]);
  });

  it("handles workflow runner failure through normal failure path", async () => {
    const task = makeTask("task-runtime-fail");
    const written: Task[] = [];
    const registry = new TaskRegistry(memoryStore([task], written));
    const scheduler = new TaskScheduler({
      registry,
      kinds: new HandlerKindRegistry(),
      configStore: { get: () => ({ schemaVersion: 1, failureTarget: null }) },
      dedup: { checkAndMark: async () => true },
      runsLog: { append: async () => {} },
      notify: { sendText: async () => {}, sendCard: async () => {} },
      agents: new AgentProviderRegistry(),
      host: { read: async () => ({ hostname: "local", pid: 1 }) },
      clock: { now: () => new Date("2026-05-18T01:00:00.000Z") },
      logger: silentLogger,
      workflowRunner: {
        startScheduledTask: async () => {
          return { status: "failed" };
        }
      }
    });

    await expect(scheduler.runOnce("task-runtime-fail")).rejects.toThrow("Scheduler workflow runner returned failed");
    expect(written.at(-1)?.lastRun?.status).toBe("failed");
    expect(written.at(-1)?.consecutiveFailures).toBe(1);
  });
});

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

function memoryStore(seed: Task[], written: Task[]): TaskStorePort {
  const tasks = new Map(seed.map((task) => [task.id, task]));
  return {
    list: () => [...tasks.values()],
    upsert: async (task) => {
      tasks.set(task.id, task);
      written.push(task);
    },
    remove: async (id) => {
      tasks.delete(id);
    }
  };
}
