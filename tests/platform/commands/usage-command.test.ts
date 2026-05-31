import { describe, expect, it } from "vitest";
import { UsageCommandHandler } from "@platform/commands/system/usage-command.js";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import type { UsageReport } from "../../../src/agent/agent-capabilities.js";

describe("UsageCommandHandler", () => {
  it("tells users to activate a provider when none is active", async () => {
    const handler = new UsageCommandHandler({ providers: new AgentProviderRegistry() });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("/provider use");
  });

  it("reports unsupported when active agent lacks UsageReporter so users see a clean message instead of error", async () => {
    const providers = new AgentProviderRegistry();
    providers.register({ kind: "codex", displayName: "Codex", buildAgent: () => ({}) as never });
    providers.setActive("codex");
    const handler = new UsageCommandHandler({ providers });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("不支持用量查询");
  });

  it("renders bucket usage when UsageReporter is implemented so quota state is visible", async () => {
    const usage: UsageReport = {
      provider: "Claude",
      plan: "Pro",
      email: "alice@example.com",
      buckets: [
        {
          name: "standard",
          allowed: true,
          limitReached: false,
          windows: [{ name: "5h", usedPercent: 42, windowSeconds: 18000, resetAfterSeconds: 3600, resetAtUnix: 0 }]
        }
      ]
    };
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "claude_code",
      displayName: "Claude Code",
      buildAgent: () => ({ getUsage: async () => usage }) as never
    });
    providers.setActive("claude_code");
    const handler = new UsageCommandHandler({ providers });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("Claude 用量");
    expect(reply.text).toContain("standard");
    expect(reply.text).toContain("42%");
    expect(reply.text).toContain("alice@example.com");
  });

  it("flags limit-reached buckets prominently so users know they are throttled", async () => {
    const usage: UsageReport = {
      provider: "Claude",
      buckets: [
        {
          name: "code-review",
          allowed: true,
          limitReached: true,
          windows: [{ name: "5h", usedPercent: 100, windowSeconds: 18000, resetAfterSeconds: 7200, resetAtUnix: 0 }]
        }
      ]
    };
    const providers = new AgentProviderRegistry();
    providers.register({
      kind: "claude_code",
      displayName: "Claude Code",
      buildAgent: () => ({ getUsage: async () => usage }) as never
    });
    providers.setActive("claude_code");
    const handler = new UsageCommandHandler({ providers });
    const reply = await handler.execute();
    if (reply.kind !== "text") throw new Error("expected text reply");
    expect(reply.text).toContain("limit reached");
  });
});
