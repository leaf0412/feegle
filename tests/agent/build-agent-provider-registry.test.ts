import { describe, expect, it } from "vitest";
import { buildAgentProviderRegistry } from "../../src/agent/build-agent-provider-registry.js";

describe("buildAgentProviderRegistry", () => {
  it("returns an empty registry when no provider envs are set", () => {
    const registry = buildAgentProviderRegistry({});
    expect(registry.available()).toEqual([]);
    expect(registry.active()).toBeUndefined();
  });

  it("registers codex when explicitly enabled and the cwd is provided", () => {
    const registry = buildAgentProviderRegistry({
      FEEGLE_PROVIDER_CODEX_ENABLED: "true",
      FEEGLE_CODEX_CWD: "/tmp/codex"
    });
    expect(registry.available().map((provider) => provider.kind)).toEqual(["codex"]);
    expect(registry.active()).toBeUndefined();
  });

  it("activates a provider when FEEGLE_ACTIVE_PROVIDER matches an enabled kind", () => {
    const registry = buildAgentProviderRegistry({
      FEEGLE_PROVIDER_CODEX_ENABLED: "true",
      FEEGLE_CODEX_CWD: "/tmp/codex",
      FEEGLE_ACTIVE_PROVIDER: "codex"
    });
    expect(registry.activeKindName()).toBe("codex");
  });

  it("does not activate when FEEGLE_ACTIVE_PROVIDER points at an unregistered kind", () => {
    const registry = buildAgentProviderRegistry({
      FEEGLE_PROVIDER_CODEX_ENABLED: "true",
      FEEGLE_CODEX_CWD: "/tmp/codex",
      FEEGLE_ACTIVE_PROVIDER: "claude_code"
    });
    expect(registry.active()).toBeUndefined();
  });

  it("throws when an enabled provider is missing its cwd to surface misconfiguration early", () => {
    expect(() => buildAgentProviderRegistry({ FEEGLE_PROVIDER_CODEX_ENABLED: "true" })).toThrow(
      /FEEGLE_CODEX_CWD must be set/
    );
  });

  it("rejects unknown sandbox values rather than silently dropping them", () => {
    expect(() =>
      buildAgentProviderRegistry({
        FEEGLE_PROVIDER_CODEX_ENABLED: "true",
        FEEGLE_CODEX_CWD: "/tmp/codex",
        FEEGLE_CODEX_SANDBOX: "wild"
      })
    ).toThrow(/sandbox must be/i);
  });
});
