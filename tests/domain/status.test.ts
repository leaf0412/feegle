import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../../src/domain/status.js";

describe("requirement state machine", () => {
  it("allows the phase 1 happy path in order", () => {
    expect(canTransition("created", "repo_selected")).toBe(true);
    expect(canTransition("repo_selected", "requirement_received")).toBe(true);
    expect(canTransition("requirement_received", "branch_suggested")).toBe(true);
    expect(canTransition("branch_suggested", "branch_created")).toBe(true);
    expect(canTransition("branch_created", "requirement_materialized")).toBe(true);
    expect(canTransition("requirement_materialized", "prototype_generated")).toBe(true);
    expect(canTransition("prototype_generated", "prototype_reviewing")).toBe(true);
    expect(canTransition("prototype_reviewing", "plan_generated")).toBe(true);
    expect(canTransition("plan_generated", "plan_confirmed")).toBe(true);
    expect(canTransition("plan_confirmed", "dev_running")).toBe(true);
    expect(canTransition("dev_running", "committed")).toBe(true);
    expect(canTransition("committed", "push_ready")).toBe(true);
    expect(canTransition("push_ready", "pushed")).toBe(true);
    expect(canTransition("pushed", "closed")).toBe(true);
  });

  it("rejects skipping branch creation before materializing requirements", () => {
    expect(canTransition("branch_suggested", "requirement_materialized")).toBe(false);
    expect(() => assertTransition("branch_suggested", "requirement_materialized")).toThrow(
      "Invalid requirement transition: branch_suggested -> requirement_materialized"
    );
  });
});
