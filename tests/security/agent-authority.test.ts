import { describe, expect, it } from "vitest";
import { defaultAgentAuthority } from "../../src/security/agent-authority.js";

describe("agent authority", () => {
  it("agents cannot approve memory", () => {
    expect(defaultAgentAuthority.canApproveMemory("agent")).toBe(false);
  });

  it("agents cannot grant permissions", () => {
    expect(defaultAgentAuthority.canGrantPermissions("agent")).toBe(false);
  });

  it("users can approve memory", () => {
    expect(defaultAgentAuthority.canApproveMemory("user")).toBe(true);
  });

  it("agents can execute effects", () => {
    expect(defaultAgentAuthority.canExecuteEffect("agent")).toBe(true);
  });
});
