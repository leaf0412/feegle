import { describe, expect, it } from "vitest";
import { PlatformActionRouter } from "../../src/platform/action-router.js";

describe("PlatformActionRouter", () => {
  it("routes nav actions to card renderers", async () => {
    const router = new PlatformActionRouter();
    router.registerNav("/status", async ({ args }) => ({ kind: "nav", args }));

    await expect(router.route("nav:/status req_1", "session")).resolves.toEqual({
      kind: "nav",
      args: "req_1"
    });
  });

  it("routes act actions to side effects", async () => {
    const calls: string[] = [];
    const router = new PlatformActionRouter();
    router.registerAct("/push", async ({ args }) => {
      calls.push(args);
      return { ok: true };
    });

    await expect(router.route("act:/push repo web", "session")).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["repo web"]);
  });
});
