import { describe, expect, it } from "vitest";
import { parseProviderArgs } from "@platform/commands/provider/parse-provider-args.js";

describe("parseProviderArgs", () => {
  it("splits kind and key=value pairs", () => {
    expect(parseProviderArgs("codex cwd=/tmp/work approvalPolicy=on-request")).toEqual({
      kind: "codex",
      fields: { cwd: "/tmp/work", approvalPolicy: "on-request" }
    });
  });

  it("supports double-quoted values containing spaces", () => {
    expect(parseProviderArgs(`codex cwd="/Users/yb/My Work"`)).toEqual({
      kind: "codex",
      fields: { cwd: "/Users/yb/My Work" }
    });
  });

  it("parses numeric strings as raw strings (coercion happens later)", () => {
    expect(parseProviderArgs("codex cwd=/tmp timeoutMs=120000")).toEqual({
      kind: "codex",
      fields: { cwd: "/tmp", timeoutMs: "120000" }
    });
  });

  it("trims whitespace + tolerates double spaces", () => {
    expect(parseProviderArgs("  codex   cwd=/tmp  ")).toEqual({
      kind: "codex",
      fields: { cwd: "/tmp" }
    });
  });

  it("throws on missing kind token", () => {
    expect(() => parseProviderArgs("")).toThrow(/kind is required/i);
  });

  it("throws on a malformed pair without =", () => {
    expect(() => parseProviderArgs("codex cwd")).toThrow(/expected key=value: cwd/);
  });

  it("throws on a value containing =", () => {
    expect(() => parseProviderArgs("codex cwd=/tmp foo=bar=baz")).toThrow(/= in value/);
  });

  it("returns kind only when no fields present", () => {
    expect(parseProviderArgs("codex")).toEqual({ kind: "codex", fields: {} });
  });
});
