import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import type { ProviderStore } from "../../../src/agent/provider-store.js";
import { ConfigStore } from "../../../src/infra/app/config-store.js";
import { buildSlashCommandRegistry } from "../../../src/platform/build-slash-command-registry.js";
import { FeishuCommandResponder } from "../../../src/integrations/feishu/feishu-command-responder.js";
import { HandlerKindRegistry } from "../../../src/features/scheduler/handler-kind-registry.js";
import { TaskRegistry } from "../../../src/features/scheduler/task-registry.js";
import { TaskScheduler } from "../../../src/features/scheduler/task-scheduler.js";
import type { HandlerKind } from "../../../src/features/scheduler/handler-kind.js";
import type { Task } from "../../../src/features/scheduler/task.js";
import type { FeishuClientPort } from "../../../src/integrations/feishu/feishu-client.js";
import { makeFakeFeishuClient } from "../../fixtures/fake-feishu-client.js";
import type { StockStore } from "../../../src/integrations/stock/stock-store.js";

describe("scheduler slash commands", () => {
  it("adds concrete cron, stock, portfolio, and error_target commands to the catalog", () => {
    const deps = makeDeps(new Set());
    const registry = makeRegistry(deps);

    expect(registry.listCommands("cron").map((command) => command.id)).toContain("cron_run_now");
    expect(registry.listCommands("stock").map((command) => command.id)).toContain("portfolio_set");
    expect(registry.findByInput("/heartbeat")).toBeUndefined();
    expect(registry.findByInput("/cron list")?.id).toBe("cron_list");
    expect(registry.isImplemented("cron_run_now")).toBe(true);
  });

  it("refuses to build when scheduler deps are missing instead of degrading to planned", () => {
    expect(() => buildSlashCommandRegistry({ repositories: { list: () => [] } })).toThrow(
      /scheduler command module requires/
    );
  });

  it("silently drops owner-only commands from non-owners", async () => {
    const replies: string[] = [];
    const deps = makeDeps(new Set(["alice@example.com"]));
    const registry = makeRegistry(deps);
    const responder = new FeishuCommandResponder(fakeClient(replies), {
      registry,
      configStore: deps.configStore,
      taskRegistry: deps.taskRegistry
    });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_1",
      sender: { platform: "feishu", userId: "ou_other" },
      command: {
        type: "slash_command",
        definition: registry.findByInput("/error_target set")!,
        raw: "/error_target set"
      }
    });

    expect(replies).toEqual([]);
  });

  it("binds the failure target for owners", async () => {
    const replies: string[] = [];
    const deps = makeDeps(new Set(["alice@example.com"]));
    const registry = makeRegistry(deps);
    const responder = new FeishuCommandResponder(fakeClient(replies), {
      registry,
      configStore: deps.configStore,
      taskRegistry: deps.taskRegistry
    });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_ops",
      messageId: "om_1",
      sender: { platform: "feishu", userId: "ou_owner", email: "alice@example.com" },
      command: {
        type: "slash_command",
        definition: registry.findByInput("/error_target set")!,
        raw: "/error_target set"
      }
    });

    expect(deps.configStore.get().failureTarget).toEqual({ platform: "feishu", chatId: "oc_ops" });
    expect(replies[0]).toContain("故障通知群已绑定");
  });

  it("creates cron tasks only after validating kind params", async () => {
    const replies: string[] = [];
    const deps = makeDeps(new Set(["alice@example.com"]));
    const registry = makeRegistry(deps);
    const responder = new FeishuCommandResponder(fakeClient(replies), {
      registry,
      configStore: deps.configStore,
      taskRegistry: deps.taskRegistry
    });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_1",
      sender: { platform: "feishu", userId: "ou_owner", email: "alice@example.com" },
      command: {
        type: "slash_command",
        definition: registry.findByInput("/cron add heartbeat \"0 9 * * *\"")!,
        raw: '/cron add heartbeat "0 9 * * *"'
      }
    });

    expect(deps.taskRegistry.list()).toHaveLength(1);
    expect(replies[0]).toContain("已创建任务");
  });

  it("binds stock subscriptions and creates a domain monitor task", async () => {
    const replies: string[] = [];
    const deps = makeDeps(new Set(["alice@example.com"]));
    const registry = makeRegistry(deps);
    const responder = new FeishuCommandResponder(fakeClient(replies), {
      registry,
      configStore: deps.configStore,
      taskRegistry: deps.taskRegistry
    });

    await responder.handleCommand({
      source: "message",
      chatId: "oc_1",
      messageId: "om_1",
      sender: { platform: "feishu", userId: "ou_owner", email: "alice@example.com" },
      command: {
        type: "slash_command",
        definition: registry.findByInput("/bind_stocks 600519")!,
        raw: "/bind_stocks 600519"
      }
    });

    expect(deps.stockStore.listSubscriptions().map((item) => item.stockCode)).toEqual(["sh600519"]);
    expect(deps.taskRegistry.list().map((task) => task.kind)).toEqual(["stock-monitor"]);
  });
});

function makeRegistry(deps: ReturnType<typeof makeDeps>) {
  return buildSlashCommandRegistry({
    repositories: { list: () => [] },
    ownerEmails: deps.ownerEmails,
    taskRegistry: deps.taskRegistry,
    configStore: deps.configStore,
    stockStore: deps.stockStore,
    quote: deps.quote,
    kinds: deps.kinds,
    scheduler: deps.scheduler,
    providers: new AgentProviderRegistry(),
    providerStore: {} as ProviderStore
  });
}

function makeDeps(ownerEmails: ReadonlySet<string>) {
  const tasks: Task[] = [];
  const taskRegistry = new TaskRegistry({
    list: () => tasks,
    upsert: async (task) => {
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) tasks[index] = task;
      else tasks.push(task);
    },
    remove: async (id) => {
      const index = tasks.findIndex((item) => item.id === id);
      if (index >= 0) tasks.splice(index, 1);
    }
  });
  const config = { schemaVersion: 1 as const, failureTarget: null as { platform: "feishu"; chatId: string } | null };
  const configStore = {
    get: () => ({ ...config, failureTarget: config.failureTarget ? { ...config.failureTarget } : null }),
    setFailureTarget: async (target: { platform: "feishu"; chatId: string } | null) => {
      config.failureTarget = target;
    }
  } as ConfigStore;
  const subscriptions: Array<{ stockCode: string; addedAt: string; addedBy: string }> = [];
  const stockStore = {
    listSubscriptions: () => subscriptions,
    addSubscriptions: async (codes: string[], addedBy: string) => {
      const added: string[] = [];
      const alreadyPresent: string[] = [];
      for (const code of codes) {
        if (subscriptions.some((item) => item.stockCode === code)) alreadyPresent.push(code);
        else {
          subscriptions.push({ stockCode: code, addedAt: "now", addedBy });
          added.push(code);
        }
      }
      return { added, alreadyPresent };
    },
    removeSubscriptions: async () => ({ removed: [], missing: [] }),
    listPortfolio: () => [],
    getPortfolio: () => undefined
  } as unknown as StockStore;
  const kind: HandlerKind<Record<string, never>> = {
    id: "heartbeat",
    title: "Heartbeat",
    description: "test",
    parseParams: () => ({}),
    describeParams: () => "none",
    run: async () => ({ outcome: "noop" })
  };
  const kinds = new HandlerKindRegistry().register(kind);
  const scheduler = new TaskScheduler({
    registry: taskRegistry,
    configStore,
    kinds,
    dedup: { checkAndMark: async () => true },
    runsLog: { append: async () => {} },
    notify: { sendText: async () => {}, sendCard: async () => {} },
    agents: new AgentProviderRegistry(),
    host: { read: async () => ({ hostname: "local", pid: 1 }) },
    clock: { now: () => new Date("2026-05-18T01:00:00.000Z") },
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  });
  return {
    ownerEmails,
    taskRegistry,
    configStore,
    stockStore,
    quote: { query: async () => [] },
    kinds,
    scheduler
  };
}

function fakeClient(replies: string[]): FeishuClientPort {
  return makeFakeFeishuClient({
    replyText: async (_messageId, text) => {
      replies.push(text);
      return "om_reply";
    }
  });
}
