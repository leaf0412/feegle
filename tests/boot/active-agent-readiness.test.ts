import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "@integrations/agent/agent-provider-registry.js";
import { checkAgentReadiness } from "@infra/boot/warn-startup-gaps.js";
import type { AgentCli } from "@integrations/agent/agent-cli.js";

function ok(): AgentCli {
  return {} as AgentCli;
}
function missing(kind: string): () => AgentCli {
  return () => {
    throw new Error(`agent binary "${kind}" not found on PATH. Install it or set "command" ...`);
  };
}

describe("checkAgentReadiness", () => {
  it("probes EVERY registered provider, not just the active one, marking which is active", () => {
    const registry = new AgentProviderRegistry();
    registry.register({ kind: "codex", displayName: "Codex", buildAgent: ok });
    registry.register({ kind: "claude_code", displayName: "Claude Code", buildAgent: missing("claude") });
    registry.setActive("codex");

    const results = checkAgentReadiness(registry);

    expect(results.map((r) => r.kind)).toEqual(["codex", "claude_code"]);
    const codex = results.find((r) => r.kind === "codex")!;
    const claude = results.find((r) => r.kind === "claude_code")!;
    expect(codex.status).toBe("ok");
    expect(codex.active).toBe(true);
    expect(codex.message).toContain("(active)");
    expect(claude.status).toBe("warn"); // claude not on PATH — still reported
    expect(claude.active).toBe(false);
    expect(claude.message).toContain("not found on PATH");
  });

  it("warns for an unavailable provider without aborting boot", () => {
    const registry = new AgentProviderRegistry();
    registry.register({ kind: "codex", displayName: "Codex", buildAgent: missing("codex") });
    registry.setActive("codex");

    const [result] = checkAgentReadiness(registry);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("not found on PATH");
  });

  it("warns when no agent providers are registered so the operator knows agent tasks will fail", () => {
    const results = checkAgentReadiness(new AgentProviderRegistry());
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("warn");
    expect(results[0]!.message).toMatch(/no agent providers/i);
  });
});
