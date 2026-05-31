import { describe, expect, it } from "vitest";
import { BootContext } from "@infra/boot/boot-context.js";

describe("BootContext", () => {
  it("returns the provided value as a typed capability", () => {
    const ctx = new BootContext();
    ctx.provide("workspaceRootForTest" as never, "value" as never);
    expect(ctx.require("workspaceRootForTest" as never)).toBe("value");
  });

  it("throws when requiring a capability that was never provided", () => {
    const ctx = new BootContext();
    expect(() => ctx.require("quote")).toThrow(/capability not ready: quote/);
  });

  it("throws when the same capability is provided twice", () => {
    const ctx = new BootContext();
    ctx.provide("workspaceRootForTest" as never, 1 as never);
    expect(() => ctx.provide("workspaceRootForTest" as never, 2 as never)).toThrow(
      /capability already provided: workspaceRootForTest/
    );
  });

  it("pick returns a slice with every requested key", () => {
    const ctx = new BootContext();
    ctx.provide("a" as never, 1 as never);
    ctx.provide("b" as never, 2 as never);
    expect(ctx.pick("a" as never, "b" as never)).toEqual({ a: 1, b: 2 });
  });

  it("can provide and require runtime orchestration capabilities", () => {
    const ctx = new BootContext();
    const value = { marker: "runtime" } as never;

    ctx.provide("workflowRegistry", value);

    expect(ctx.require("workflowRegistry")).toBe(value);
  });
});
