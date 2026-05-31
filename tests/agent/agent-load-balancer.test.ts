import { describe, expect, it } from "vitest";
import { AgentLoadBalancer } from "@integrations/agent/agent-load-balancer.js";

describe("AgentLoadBalancer", () => {
  it("picks the candidate with the fewest in-flight turns so load actually spreads", () => {
    const balancer = new AgentLoadBalancer();
    balancer.acquire("codex");
    expect(balancer.select(["codex", "claude_code"])).toBe("claude_code");
  });

  it("rotates round-robin across ties so consecutive idle selects cycle through all candidates", () => {
    const balancer = new AgentLoadBalancer();
    const picks = [
      balancer.select(["codex", "claude_code"]),
      balancer.select(["codex", "claude_code"]),
      balancer.select(["codex", "claude_code"])
    ];
    expect(new Set(picks).size).toBe(2); // both agents used, not stacked on one
    expect(picks[0]).not.toBe(picks[1]);
    expect(picks[0]).toBe(picks[2]); // ring of size 2 returns to start
  });

  it("does not let a non-tie select desync the tie rotation", () => {
    const balancer = new AgentLoadBalancer();
    const first = balancer.select(["codex", "claude_code"]); // tie
    balancer.acquire("claude_code");
    expect(balancer.select(["codex", "claude_code"])).toBe("codex"); // not a tie: 0 < 1
    balancer.release("claude_code");
    const third = balancer.select(["codex", "claude_code"]); // tie again
    expect(third).not.toBe(first); // rotation not desynced by the non-tie call
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
