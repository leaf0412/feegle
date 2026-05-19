import { describe, expect, it } from "vitest";
import {
  buildProviderAdapter,
  defaultProviderDisplayName
} from "../../src/agent/provider-adapter-factory.js";
import { CodexAgentAdapter } from "../../src/agent/codex-agent-adapter.js";
import { ClaudeCodeAgentAdapter } from "../../src/agent/claude-code-agent-adapter.js";

describe("provider-adapter-factory", () => {
  it("builds a CodexAgentAdapter for codex records", () => {
    const adapter = buildProviderAdapter({
      kind: "codex",
      cwd: "/tmp/codex"
    });
    expect(adapter).toBeInstanceOf(CodexAgentAdapter);
  });

  it("builds a ClaudeCodeAgentAdapter for claude_code records", () => {
    const adapter = buildProviderAdapter({
      kind: "claude_code",
      cwd: "/tmp/claude"
    });
    expect(adapter).toBeInstanceOf(ClaudeCodeAgentAdapter);
  });

  it("maps each kind to a stable display name", () => {
    expect(defaultProviderDisplayName("codex")).toBe("Codex");
    expect(defaultProviderDisplayName("claude_code")).toBe("Claude Code");
  });
});
