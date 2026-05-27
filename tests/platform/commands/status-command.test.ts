import { describe, expect, it } from "vitest";
import { StatusCommandHandler } from "../../../src/platform/commands/system/status-command.js";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import type { RunsLogEntry } from "../../../src/scheduler/runs-log.js";
import type { TaskRegistry } from "../../../src/scheduler/task-registry.js";
import type { Task } from "../../../src/scheduler/task.js";

function makeTaskRegistry(tasks: readonly Task[]): TaskRegistry {
  return { list: () => tasks } as unknown as TaskRegistry;
}

function makeTask(id: string, enabled: boolean): Task {
  return {
    id,
    name: id,
    kind: "heartbeat",
    params: {},
    cron: "0 9 * * *",
    timezone: "Asia/Shanghai",
    activeHours: null,
    target: null,
    enabled,
    source: "seed",
    errorPolicy: "on-change",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastRun: null,
    consecutiveFailures: 0,
    lastErrorNotifiedAt: null
  };
}

function makeRunsLog(entries: readonly RunsLogEntry[]) {
  return {
    async *tailReverse(filter: { limit?: number } = {}) {
      const limit = filter.limit ?? entries.length;
      for (let i = 0; i < Math.min(limit, entries.length); i++) {
        yield entries[i]!;
      }
    }
  };
}

describe("StatusCommandHandler", () => {
  it("reports 'no active agent' so users know they need to run /provider use", async () => {
    const handler = new StatusCommandHandler({
      taskRegistry: makeTaskRegistry([]),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("default agent (config/cron): (none");
  });

  it("counts only enabled tasks so operators can see scheduler load at a glance", async () => {
    const tasks = [makeTask("a", true), makeTask("b", true), makeTask("c", false)];
    const handler = new StatusCommandHandler({
      taskRegistry: makeTaskRegistry(tasks),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("tasks: 2/3 enabled");
  });

  it("surfaces the most recent run so /status doubles as a quick health probe", async () => {
    const runsLog = makeRunsLog([
      {
        taskId: "seed_heartbeat",
        kind: "heartbeat",
        at: "2026-05-19T22:00:00.000Z",
        outcome: "ok",
        durationMs: 12
      }
    ]);
    const handler = new StatusCommandHandler({
      taskRegistry: makeTaskRegistry([]),
      providers: new AgentProviderRegistry(),
      runsLog
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("seed_heartbeat");
    expect(reply.text).toContain("ok");
  });

  it("falls back to 'no runs yet' when runsLog is empty so brand-new instances report cleanly", async () => {
    const handler = new StatusCommandHandler({
      taskRegistry: makeTaskRegistry([]),
      providers: new AgentProviderRegistry(),
      runsLog: makeRunsLog([])
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("no runs yet");
  });
});
