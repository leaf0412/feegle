import { describe, expect, it } from "vitest";
import { HandlerKindRegistry } from "../../src/features/scheduler/handler-kind-registry.js";
import type { HandlerKind } from "../../src/features/scheduler/handler-kind.js";

const kind: HandlerKind<Record<string, never>> = {
  id: "heartbeat",
  title: "Heartbeat",
  description: "Sends heartbeat",
  parseParams: () => ({}),
  describeParams: () => "no params",
  run: async () => ({ outcome: "noop" })
};

describe("HandlerKindRegistry", () => {
  it("rejects duplicate ids so a task kind has a single implementation", () => {
    const registry = new HandlerKindRegistry().register(kind);

    expect(() => registry.register(kind)).toThrow("Duplicate kind: heartbeat");
  });

  it("lists registered kinds for cron command discovery", () => {
    expect(new HandlerKindRegistry().register(kind).list()).toEqual([kind]);
  });

  it("freeze blocks late kind registration so runtime cannot mutate the boot snapshot", () => {
    const registry = new HandlerKindRegistry().register(kind).freeze();
    expect(() => registry.register({ ...kind, id: "late" })).toThrow(/frozen/);
    expect(registry.get("heartbeat")).toBe(kind);
  });
});
