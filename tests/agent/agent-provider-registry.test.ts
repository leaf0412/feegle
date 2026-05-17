import { describe, expect, it, vi } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import type { AgentCli } from "../../src/agent/agent-cli.js";

function stubAgent(): AgentCli {
  return {
    chat: vi.fn(),
    generatePrototype: vi.fn(),
    generatePlan: vi.fn(),
    runDevelopmentTask: vi.fn()
  } as unknown as AgentCli;
}

describe("AgentProviderRegistry", () => {
  it("starts empty with no active provider", () => {
    const registry = new AgentProviderRegistry();
    expect(registry.available()).toEqual([]);
    expect(registry.active()).toBeUndefined();
    expect(registry.resolveActiveAgent()).toBeUndefined();
  });

  it("registers providers and lists them", () => {
    const registry = new AgentProviderRegistry();
    registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => stubAgent() });
    registry.register({ kind: "claude_code", displayName: "Claude Code", buildAgent: () => stubAgent() });
    expect(registry.available().map((p) => p.kind)).toEqual(["codex", "claude_code"]);
  });

  it("refuses to setActive when the kind is not registered", () => {
    const registry = new AgentProviderRegistry();
    expect(() => registry.setActive("codex")).toThrow(/not registered/);
  });

  it("setActive marks the chosen provider as active and resolveActiveAgent builds it", () => {
    const registry = new AgentProviderRegistry();
    const agent = stubAgent();
    registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => agent });
    registry.setActive("codex");
    expect(registry.active()?.kind).toBe("codex");
    expect(registry.activeKindName()).toBe("codex");
    expect(registry.resolveActiveAgent()).toBe(agent);
  });

  it("unregistering the active provider clears the active selection", () => {
    const registry = new AgentProviderRegistry();
    registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => stubAgent() });
    registry.setActive("codex");
    registry.unregister("codex");
    expect(registry.active()).toBeUndefined();
  });

  it("rejects duplicate registrations", () => {
    const registry = new AgentProviderRegistry();
    registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => stubAgent() });
    expect(() =>
      registry.register({ kind: "codex", displayName: "Codex", buildAgent: () => stubAgent() })
    ).toThrow(/already registered/);
  });
});
