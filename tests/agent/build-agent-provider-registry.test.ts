import { describe, expect, it, vi } from "vitest";
import { buildAgentProviderRegistry } from "../../src/agent/build-agent-provider-registry.js";
import type { ProvidersFile } from "../../src/agent/provider-store.js";

function fakeStore(file: ProvidersFile): {
  snapshot: () => ProvidersFile;
  setActive: (kind: ProvidersFile["activeKind"]) => Promise<void>;
} {
  let current = file;
  return {
    snapshot: () => ({ ...current, providers: current.providers.map((p) => ({ ...p })) }),
    setActive: async (kind) => {
      current = { ...current, activeKind: kind };
    }
  };
}

describe("buildAgentProviderRegistry", () => {
  it("uses config agent providers and activates the configured default", () => {
    const registry = buildAgentProviderRegistry({
      store: fakeStore({ schemaVersion: 1, providers: [], activeKind: null }),
      config: {
        default: "codex",
        providers: {
          codex: { command: "codex", cwd: "/repo" }
        }
      },
      adapterFactory: () => ({
        chat: async () => "",
        generatePrototype: async () => "",
        generatePlan: async () => "",
        runDevelopmentTask: async () => ""
      })
    });

    expect(registry.activeKindName()).toBe("codex");
  });

  it("throws when config default points at a missing provider", () => {
    expect(() =>
      buildAgentProviderRegistry({
        store: fakeStore({ schemaVersion: 1, providers: [], activeKind: null }),
        config: {
          default: "codex",
          providers: {}
        }
      })
    ).toThrow(/agent.default provider not configured: codex/);
  });

  it("returns an empty registry when the store has no providers", () => {
    const registry = buildAgentProviderRegistry({
      store: fakeStore({ schemaVersion: 1, providers: [], activeKind: null })
    });
    expect(registry.available()).toEqual([]);
    expect(registry.active()).toBeUndefined();
  });

  it("registers every record from the store", () => {
    const registry = buildAgentProviderRegistry({
      store: fakeStore({
        schemaVersion: 1,
        providers: [
          { kind: "codex", cwd: "/tmp/codex" },
          { kind: "claude_code", cwd: "/tmp/claude" }
        ],
        activeKind: null
      })
    });
    expect(registry.available().map((p) => p.kind).sort()).toEqual(["claude_code", "codex"]);
    expect(registry.active()).toBeUndefined();
  });

  it("activates the kind named by activeKind", () => {
    const registry = buildAgentProviderRegistry({
      store: fakeStore({
        schemaVersion: 1,
        providers: [{ kind: "codex", cwd: "/tmp/codex" }],
        activeKind: "codex"
      })
    });
    expect(registry.activeKindName()).toBe("codex");
  });

  it("clears activeKind in the store + warns when it points at a missing provider", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const store = fakeStore({
        schemaVersion: 1,
        providers: [{ kind: "codex", cwd: "/tmp/codex" }],
        activeKind: "claude_code"
      });
      const setActive = vi.spyOn(store, "setActive");
      const registry = buildAgentProviderRegistry({ store });
      expect(registry.active()).toBeUndefined();
      expect(setActive).toHaveBeenCalledWith(null);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
