import { describe, expect, it } from "vitest";
import { parsePlatformAction } from "@platform/platform-action.js";

describe("parsePlatformAction", () => {
  it("parses navigational actions", () => {
    expect(parsePlatformAction("nav:/status req_1")).toEqual({
      kind: "nav",
      command: "/status",
      args: "req_1",
      raw: "nav:/status req_1"
    });
  });

  it("parses side-effect actions", () => {
    expect(parsePlatformAction("act:/push repo web")).toEqual({
      kind: "act",
      command: "/push",
      args: "repo web",
      raw: "act:/push repo web"
    });
  });

  it("parses command actions", () => {
    expect(parsePlatformAction("cmd:/repo select web api")).toEqual({
      kind: "cmd",
      command: "/repo",
      args: "select web api",
      raw: "cmd:/repo select web api"
    });
  });

  it("parses permission actions", () => {
    expect(parsePlatformAction("perm:allow_all")).toEqual({
      kind: "permission",
      behavior: "allow_all",
      raw: "perm:allow_all"
    });
  });

  it("returns unknown for malformed actions", () => {
    expect(parsePlatformAction("hello")).toEqual({ kind: "unknown", raw: "hello" });
  });
});
