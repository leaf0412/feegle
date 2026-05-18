import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import { buildHandlerKindRegistry } from "../../src/scheduler/build-handler-kind-registry.js";
import type { HandlerKind } from "../../src/scheduler/handler-kind.js";
import { TaskRegistry } from "../../src/scheduler/task-registry.js";
import type { StockStore } from "../../src/stock/stock-store.js";

describe("buildHandlerKindRegistry", () => {
  it("lets external kind modules add kinds without editing the app entry", () => {
    const kind: HandlerKind<Record<string, never>> = {
      id: "external-kind",
      title: "External",
      description: "External kind",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => ({ outcome: "noop" })
    };
    const registry = buildHandlerKindRegistry({
      taskRegistry: new TaskRegistry({ list: () => [], upsert: async () => {}, remove: async () => {} }),
      stockStore: {} as StockStore,
      quote: { query: async () => [] },
      agents: new AgentProviderRegistry(),
      modules: [
        {
          id: "external",
          register: (target) => {
            target.register(kind);
          }
        }
      ]
    });

    expect(registry.get("external-kind")).toBe(kind);
  });
});
