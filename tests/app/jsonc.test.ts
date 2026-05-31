import { describe, expect, it } from "vitest";
import { parseJsonc, setJsoncValue, unsetJsoncValue } from "../../src/infra/app/jsonc.js";

describe("setJsoncValue", () => {
  it("preserves comments and sibling fields when setting a nested value", () => {
    const raw = `{
  // top comment
  "schemaVersion": 1,
  "failureTarget": null
}`;
    const next = setJsoncValue(raw, ["agent", "providers", "codex"], { command: "codex" });
    expect(next).toContain("// top comment");
    expect(next).toContain('"schemaVersion": 1');
    expect(next).toContain('"command": "codex"');
  });

  it("setting null at a path writes `null` so callers can clear a field without deleting it", () => {
    const raw = `{ "agent": { "default": "codex", "providers": {} } }`;
    const next = setJsoncValue(raw, ["agent", "default"], null);
    expect(parseJsonc(next, "<test>")).toEqual({
      agent: { default: null, providers: {} }
    });
  });
});

describe("unsetJsoncValue", () => {
  it("removes a top-level field and preserves file-header and trailing comments", () => {
    const raw = `// operator notes — file header
{
  "a": 1,
  "b": 2 // keep me
}`;
    const next = unsetJsoncValue(raw, ["a"]);
    expect(next).toContain("// operator notes — file header");
    expect(next).toContain("// keep me");
    expect(parseJsonc(next, "<test>")).toEqual({ b: 2 });
  });

  it("removes a nested field without disturbing sibling keys or distant comments", () => {
    const raw = `{
  // top-level note
  "agent": {
    "default": "codex",
    "providers": {
      "codex": { "command": "codex" },
      "claude": { "command": "claude" }
    }
  }
}`;
    const next = unsetJsoncValue(raw, ["agent", "providers", "codex"]);
    expect(next).toContain("// top-level note");
    expect(parseJsonc(next, "<test>")).toEqual({
      agent: {
        default: "codex",
        providers: { claude: { command: "claude" } }
      }
    });
  });

  it("is a no-op when the path's parent doesn't exist so callers needn't pre-check", () => {
    const raw = `{ "a": 1 }`;
    // jsonc-parser raises "Can not delete in empty document" for fully-missing paths; we treat that
    // as success because the post-condition "field absent" already holds.
    expect(unsetJsoncValue(raw, ["does", "not", "exist"])).toBe(raw);
  });
});
