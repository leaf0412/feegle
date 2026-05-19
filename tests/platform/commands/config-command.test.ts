import { describe, expect, it } from "vitest";
import { ConfigCommandHandler } from "../../../src/platform/commands/setup/config-command.js";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import type { ConfigStorePort, FeegleConfig } from "../../../src/app/config-store.js";

function stubConfig(config: FeegleConfig): ConfigStorePort {
  return {
    get: () => config,
    setFailureTarget: async () => {}
  };
}

describe("ConfigCommandHandler", () => {
  it("shows failureTarget hint when unset so operators know to run /error_target set", async () => {
    const handler = new ConfigCommandHandler({
      configStore: stubConfig({ schemaVersion: 1, failureTarget: null }),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("故障通知");
    expect(reply.text).toContain("/error_target set");
  });

  it("renders failureTarget when set so operators can verify the binding", async () => {
    const handler = new ConfigCommandHandler({
      configStore: stubConfig({
        schemaVersion: 1,
        failureTarget: { platform: "feishu", chatId: "oc_xyz" }
      }),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("feishu:oc_xyz");
  });

  it("marks the active provider with a star and lists others as candidates", async () => {
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({} as never) });
    providers.register({ kind: "claude_code", displayName: "Claude Code", buildAgent: () => ({} as never) });
    providers.setActive("codex");

    const handler = new ConfigCommandHandler({
      configStore: stubConfig({ schemaVersion: 1, failureTarget: null }),
      providers
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("Codex (codex) ★ active");
    expect(reply.text).toContain("Claude Code (claude_code) —");
  });

  it("hints at /provider register when no provider is registered", async () => {
    const handler = new ConfigCommandHandler({
      configStore: stubConfig({ schemaVersion: 1, failureTarget: null }),
      providers: new AgentProviderRegistry()
    });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("/provider register");
  });
});
