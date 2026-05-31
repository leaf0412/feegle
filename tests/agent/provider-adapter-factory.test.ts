import { describe, expect, it } from "vitest";
import {
  buildProviderAdapter,
  defaultProviderDisplayName
} from "@integrations/agent/provider-adapter-factory.js";
import { DirectCliAdapter } from "@integrations/agent/direct-cli-adapter.js";

describe("provider-adapter-factory", () => {
  it("builds a DirectCliAdapter for codex records", () => {
    const adapter = buildProviderAdapter({
      kind: "codex",
      cwd: "/tmp/codex"
    });
    expect(adapter).toBeInstanceOf(DirectCliAdapter);
  });

  it("builds a DirectCliAdapter for claude_code records", () => {
    const adapter = buildProviderAdapter({
      kind: "claude_code",
      cwd: "/tmp/claude"
    });
    expect(adapter).toBeInstanceOf(DirectCliAdapter);
  });

  it("uses the kind label as the display name", () => {
    expect(defaultProviderDisplayName("codex")).toBe("codex");
    expect(defaultProviderDisplayName("claude_code")).toBe("claude_code");
  });
});
