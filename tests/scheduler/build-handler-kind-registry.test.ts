import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../src/agent/agent-provider-registry.js";
import { BootContext } from "../../src/boot/boot-context.js";
import { buildHandlerKindRegistry } from "../../src/scheduler/build-handler-kind-registry.js";
import type { HandlerKind } from "../../src/scheduler/handler-kind.js";
import { TaskRegistry } from "../../src/scheduler/task-registry.js";
import type { StockStore } from "../../src/integrations/stock/stock-store.js";

function contextWithCoreCaps(): BootContext {
  const ctx = new BootContext();
  ctx.provide("taskRegistry", new TaskRegistry({ list: () => [], upsert: async () => {}, remove: async () => {} }));
  ctx.provide("stockStore", {} as StockStore);
  ctx.provide("quote", { query: async () => [] });
  ctx.provide("agents", new AgentProviderRegistry());
  return ctx;
}

describe("buildHandlerKindRegistry", () => {
  it("lets a kind module add a kind that pulls its deps from the context", () => {
    const kind: HandlerKind<Record<string, never>> = {
      id: "external-kind",
      title: "External",
      description: "External kind",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => ({ outcome: "noop" })
    };
    const registry = buildHandlerKindRegistry({
      ctx: contextWithCoreCaps(),
      modules: [{ id: "external", register: (target) => target.register(kind) }]
    });

    expect(registry.get("external-kind")).toBe(kind);
  });

  it("rejects duplicate kind ids across modules so a scheduled task has a single implementation", () => {
    const kind: HandlerKind<Record<string, never>> = {
      id: "duplicate-kind",
      title: "Dup",
      description: "dup",
      parseParams: () => ({}),
      describeParams: () => "none",
      run: async () => ({ outcome: "noop" })
    };
    expect(() =>
      buildHandlerKindRegistry({
        ctx: contextWithCoreCaps(),
        modules: [
          { id: "first", register: (target) => target.register(kind) },
          { id: "second", register: (target) => target.register(kind) }
        ]
      })
    ).toThrow(/Duplicate kind/);
  });
});
