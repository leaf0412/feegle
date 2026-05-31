import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DoctorCommandHandler } from "@platform/commands/system/doctor-command.js";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import type { ConfigStorePort, FeegleConfig } from "@infra/app/config-store.js";

function stubConfig(config: FeegleConfig): ConfigStorePort {
  return { get: () => config, setFailureTarget: async () => {} };
}

let tempHome: string;

beforeEach(async () => {
  tempHome = await mkdtemp(join(tmpdir(), "feegle-doctor-"));
});

afterEach(async () => {
  await rm(tempHome, { recursive: true, force: true });
});

describe("DoctorCommandHandler", () => {
  it("flags fail when no provider is registered so users see the blocking gap immediately", async () => {
    const handler = new DoctorCommandHandler({
      feegleHome: tempHome,
      configStore: stubConfig({ schemaVersion: 1, failureTarget: null }),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("❌ provider 注册");
    expect(reply.text).toContain("存在 fail 项");
  });

  it("warns when no provider is active but at least one is registered, since some flows still work", async () => {
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
    const handler = new DoctorCommandHandler({
      feegleHome: tempHome,
      configStore: stubConfig({ schemaVersion: 1, failureTarget: null }),
      providers
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("⚠️ active provider");
  });

  it("warns when failureTarget is unset so silent failures are flagged early", async () => {
    const handler = new DoctorCommandHandler({
      feegleHome: tempHome,
      configStore: stubConfig({ schemaVersion: 1, failureTarget: null }),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("⚠️ failureTarget");
  });

  it("reports all-pass when FEEGLE_HOME exists, failureTarget set, and a provider is active", async () => {
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
    providers.setActive("codex");
    const handler = new DoctorCommandHandler({
      feegleHome: tempHome,
      configStore: stubConfig({
        schemaVersion: 1,
        failureTarget: { platform: "feishu", chatId: "oc_x" }
      }),
      providers
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("全部通过");
  });

  it("flags fail when FEEGLE_HOME is configured but unreadable so disk-permission breakage isn't silent", async () => {
    const handler = new DoctorCommandHandler({
      feegleHome: "/nonexistent/path/that/should/not/exist",
      configStore: stubConfig({ schemaVersion: 1, failureTarget: null }),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("❌ FEEGLE_HOME");
  });
});
