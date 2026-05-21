import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      ownerEmails: new Set(["alice@example.com"]),
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
        return {
          get: () => ({ schemaVersion: 1 as const, failureTarget: null }),
          setFailureTarget: async () => {}
        };
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

  it("starts from config agent providers even when legacy providers.json is invalid", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-app-config-agent-"));
    try {
      await writeFile(
        join(home, "providers.json"),
        JSON.stringify({
          schemaVersion: 1,
          providers: [{ kind: "claudecode" }],
          activeKind: "claudecode"
        })
      );
      const events: string[] = [];
      const app = new FeegleApp({
        feegleHome: home,
        ownerEmails: new Set(["alice@example.com"]),
        feishuClient: {} as FeishuClientPort,
        acquireLock: async () => async () => {},
        loadConfigStore: async () => ({
          get: () => ({
            schemaVersion: 1 as const,
            failureTarget: null,
            agent: {
              default: "codex",
              providers: {
                codex: { command: "codex" }
              }
            }
          }),
          setFailureTarget: async () => {}
        }),
        createScheduler: () => ({
          start: async () => {
            events.push("scheduler:start");
          },
          stop: async () => {}
        }),
        runtimeFactory: (_handler: FeishuCommandHandler) => ({
          start: async () => {
            events.push("runtime:start");
          },
          stop: async () => {}
        })
      });

      await app.start();
      await app.stop();

      expect(events).toEqual(["scheduler:start", "runtime:start"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("requires config agent providers instead of falling back to legacy providers.json", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-app-no-agent-config-"));
    try {
      const app = new FeegleApp({
        feegleHome: home,
        ownerEmails: new Set(["alice@example.com"]),
        feishuClient: {} as FeishuClientPort,
        acquireLock: async () => async () => {},
        loadConfigStore: async () => ({
          get: () => ({ schemaVersion: 1 as const, failureTarget: null }),
          setFailureTarget: async () => {}
        }),
        createScheduler: () => ({
          start: async () => {},
          stop: async () => {}
        }),
        runtimeFactory: (_handler: FeishuCommandHandler) => ({
          start: async () => {},
          stop: async () => {}
        })
      });

      await expect(app.start()).rejects.toThrow(/agent config is required/);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
