import { describe, expect, it } from "vitest";
import { AgentLoadBalancer } from "../../src/agent/agent-load-balancer.js";

describe("AgentLoadBalancer", () => {
  it("picks the candidate with the fewest in-flight turns so load actually spreads", () => {
    const balancer = new AgentLoadBalancer();
    balancer.acquire("codex");
    expect(balancer.select(["codex", "claude_code"])).toBe("claude_code");
  });

  it("rotates round-robin on ties so a cold start does not stack every session on one agent", () => {
    const balancer = new AgentLoadBalancer();
    const first = balancer.select(["codex", "claude_code"]);
    const second = balancer.select(["codex", "claude_code"]);
    expect(first).not.toBe(second);
  });

  it("release floors at zero so an over-release cannot make a busy agent look idle", () => {
    const balancer = new AgentLoadBalancer();
    balancer.acquire("codex");
    balancer.release("codex");
    balancer.release("codex");
    expect(balancer.inFlightCount("codex")).toBe(0);
  });

  it("counts concurrent acquires so two open turns register as load", () => {
    const balancer = new AgentLoadBalancer();
    balancer.acquire("codex");
    balancer.acquire("codex");
    expect(balancer.inFlightCount("codex")).toBe(2);
  });

  it("throws when asked to select with no candidates instead of returning undefined", () => {
    const balancer = new AgentLoadBalancer();
    expect(() => balancer.select([])).toThrow(/no candidates/);
  });
});
