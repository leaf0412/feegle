import { describe, expect, it } from "vitest";
import {
  buildProviderAdapter,
  defaultProviderDisplayName
} from "../../src/agent/provider-adapter-factory.js";
import { AcpAgentAdapter } from "../../src/agent/acp-agent-adapter.js";

describe("provider-adapter-factory", () => {
  it("builds an AcpAgentAdapter for codex records", () => {
    const adapter = buildProviderAdapter({
      kind: "codex",
      cwd: "/tmp/codex"
    });
    expect(adapter).toBeInstanceOf(AcpAgentAdapter);
  });

  it("builds an AcpAgentAdapter for claude_code records", () => {
    const adapter = buildProviderAdapter({
      kind: "claude_code",
      cwd: "/tmp/claude"
    });
    expect(adapter).toBeInstanceOf(AcpAgentAdapter);
  });

  it("uses the kind label as the display name", () => {
    expect(defaultProviderDisplayName("codex")).toBe("codex");
    expect(defaultProviderDisplayName("claude_code")).toBe("claude_code");
  });
});
