import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import { FeegleApp, type FeegleAppDeps } from "../../src/infra/app/feegle-app.js";
import { openRuntimeDb, type RuntimeDb } from "../../src/infra/app/runtime-db.js";
import { BootContext } from "../../src/infra/boot/boot-context.js";
import { runtimePhase } from "../../src/infra/boot/phases/runtime-phase.js";
import type { FeishuCloudDocClientPort } from "../../src/integrations/feishu/feishu-cloud-doc-client.js";
import type { FeishuClientPort } from "../../src/integrations/feishu/feishu-client.js";
import { RuntimeStore } from "../../src/core/runtime/runtime-store.js";
import { fakeConfigStore } from "../fixtures/fake-config-store.js";

function fakeCloudDoc(): FeishuCloudDocClientPort {
  return {
    async createDoc() {
      return { documentId: "doc_test" };
    },
    async writeMarkdown() {},
    async deleteDoc() {},
    buildDocUrl(documentId: string) {
      return `https://feishu.cn/docx/${documentId}`;
    }
  };
}

function baseDeps(home: string, overrides: Partial<FeegleAppDeps>): FeegleAppDeps {
  return {
    feegleHome: home,
    ownerEmails: new Set<string>(),
    feishuClient: {} as FeishuClientPort,
    cloudDoc: fakeCloudDoc(),
    agentProviders: new AgentProviderRegistry(),
    acquireLock: async () => async () => {},
    loadConfigStore: async () => fakeConfigStore(),
    createScheduler: () => ({ start: async () => {}, stop: async () => {} }),
    ...overrides
  } as FeegleAppDeps;
}

function buildBootContextWithRuntimeStoreHavingRunningAttempt(db: RuntimeDb): BootContext {
  db.prepare(
    `insert into workspaces (id, name, created_at, updated_at)
     values ('ws_1', 'Personal', '2026-05-31T00:00:00.000Z', '2026-05-31T00:00:00.000Z')`
  ).run();
  const store = new RuntimeStore(db);
  store.registerWorkflowDefinition({
    id: "test.recover",
    version: 1,
    concurrencyPolicy: "reject_if_running",
    now: "2026-05-31T00:00:01.000Z"
  });
  store.createWorkflowInstance({
    id: "wfi_1",
    workspaceId: "ws_1",
    projectId: null,
    definitionId: "test.recover",
    definitionVersion: 1,
    status: "running",
    now: "2026-05-31T00:00:02.000Z"
  });
  store.createRunAttempt({
    id: "run_1",
    workflowInstanceId: "wfi_1",
    status: "running",
    triggerEventId: null,
    now: "2026-05-31T00:00:03.000Z"
  });

  const ctx = new BootContext();
  ctx.provide("runtimeStore", store);
  return ctx;
}

describe("FeegleApp boot", () => {
  it("runs all boot phases to ok and starts the platform runtime", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-boot-ok-"));
    try {
      let started = false;
      const app = new FeegleApp(
        baseDeps(home, {
          runtimeFactory: () => ({
            start: async () => {
              started = true;
            },
            stop: async () => {}
          })
        })
      );

      await app.start();
      const report = app.bootReport();

      expect(report?.phases.map((p) => p.phase)).toEqual([
        "infra",
        "stores",
        "providers",
        "kinds",
        "scheduler",
        "commands",
        "runtime-contributions",
        "runtime"
      ]);
      expect(report?.phases.every((p) => p.status === "ok")).toBe(true);
      expect(started).toBe(true);

      await app.stop();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("aborts boot when a platform runtime fails to start, naming the runtime phase", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-boot-fail-"));
    try {
      const app = new FeegleApp(
        baseDeps(home, {
          runtimeFactory: () => ({
            start: async () => {
              throw new Error("connect failed");
            }
          })
        })
      );

      await expect(app.start()).rejects.toMatchObject({ name: "BootAbortError", phase: "runtime" });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("marks running workflow attempts interrupted before platform runtimes start", async () => {
    const home = await mkdtemp(join(tmpdir(), "feegle-boot-recovery-"));
    const db = openRuntimeDb(join(home, "feegle.db"));
    try {
      const ctx = buildBootContextWithRuntimeStoreHavingRunningAttempt(db);
      const started: string[] = [];
      const phase = runtimePhase({
        contributions: {
          handlerKinds: [],
          slashCommands: [],
          quoteClients: [],
          notificationAdapters: [],
          provisions: [],
          runtimeContributions: [],
          platformRuntimes: [
            {
              id: "test",
              create: () => ({
                start: async () => {
                  started.push("platform");
                }
              })
            }
          ]
        },
        onRuntime: () => undefined
      });

      await phase.run(ctx);

      expect(ctx.require("runtimeStore").getRunAttempt("run_1")?.status).toBe("interrupted");
      expect(started).toEqual(["platform"]);
    } finally {
      db.close();
      await rm(home, { recursive: true, force: true });
    }
  });
});
