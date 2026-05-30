import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import { FeegleApp, type FeegleAppDeps } from "../../src/app/feegle-app.js";
import type { FeishuCloudDocClientPort } from "../../src/feishu/feishu-cloud-doc-client.js";
import type { FeishuClientPort } from "../../src/feishu/feishu-client.js";
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
});
