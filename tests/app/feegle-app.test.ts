import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import { FeegleApp } from "../../src/app/feegle-app.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
import type { FeishuCommandHandler } from "../../src/feishu/feishu-long-connection-runtime.js";

describe("FeegleApp", () => {
  it("starts scheduler-facing services before the Feishu runtime", async () => {
    const events: string[] = [];
    const app = new FeegleApp({
      feegleHome: "/tmp/feegle-app-test",
      ownerIdentities: new Set(["feishu:ou_1"]),
      feishuClient: {} as FeishuClientPort,
      agentProviders: new AgentProviderRegistry(),
      acquireLock: async () => {
        events.push("lock");
        return async () => {
          events.push("unlock");
        };
      },
      loadConfigStore: async () => {
        events.push("config");
        return { get: () => ({ schemaVersion: 1, failureTarget: null }) };
      },
      createScheduler: () => ({
        start: async () => {
          events.push("scheduler:start");
        },
        stop: async () => {
          events.push("scheduler:stop");
        }
      }),
      runtimeFactory: (_handler: FeishuCommandHandler) => ({
        start: async () => {
          events.push("runtime:start");
        },
        stop: async () => {
          events.push("runtime:stop");
        }
      })
    });

    await app.start();
    await app.stop();

    expect(events).toEqual([
      "lock",
      "config",
      "scheduler:start",
      "runtime:start",
      "runtime:stop",
      "scheduler:stop",
      "unlock"
    ]);
  });
});
