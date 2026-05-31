import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import type { AgentCli } from "../../../src/agent/agent-cli.js";
import type { NotificationPort } from "../../../src/infra/app/notification-port.js";
import type { Quote } from "../../../src/integrations/stock/stock-quote-port.js";
import type { Task } from "../../../src/features/scheduler/task.js";
import type { TaskContext } from "../../../src/features/scheduler/task-context.js";

export function makeTask(patch: Partial<Task> = {}): Task {
  return {
    id: "01TASK",
    name: "test task",
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

export function createTaskContext(patch: Partial<TaskContext> = {}): TaskContext {
  return {
    task: patch.task ?? makeTask(),
    now: patch.now ?? new Date("2026-05-18T01:30:00.000Z"),
    logger: patch.logger ?? { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    notify: patch.notify ?? noopNotify,
    agents: patch.agents ?? new AgentProviderRegistry(),
    dedup: patch.dedup ?? { checkAndMark: async () => true },
    host: patch.host ?? { read: async () => ({ hostname: "local", pid: 123 }) }
  };
}

export function quote(patch: Partial<Quote> = {}): Quote {
  return {
    stockCode: "sh600519",
    name: "贵州茅台",
    current: 1700,
    open: 1690,
    prevClose: 1680,
    high: 1710,
    low: 1648,
    volume: 100,
    amount: 170000,
    at: new Date("2026-05-18T10:30:00+08:00"),
    ...patch
  };
}

export function makeAgent(response: string): AgentCli {
  return {
    chat: async () => response,
    generatePrototype: async () => "",
    generatePlan: async () => "",
    runDevelopmentTask: async () => ""
  };
}

const noopNotify: NotificationPort = {
  sendText: async () => {},
  sendCard: async () => {}
};
