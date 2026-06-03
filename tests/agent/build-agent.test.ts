import { describe, expect, it } from "vitest";
import { buildAgent } from "@integrations/agent/build-agent.js";
import { OpencodeAgent } from "@integrations/agent/opencode/opencode-agent.js";
import { CodexAgent } from "@integrations/agent/codex/codex-agent.js";
import { ClaudeCodeAgent } from "@integrations/agent/claude-code/claude-code-agent.js";

describe("buildAgent", () => {
  it("builds an OpencodeAgent for protocol opencode", () => {
    expect(buildAgent({ kind: "oc", protocol: "opencode" })).toBeInstanceOf(OpencodeAgent);
  });

  it("builds a CodexAgent for protocol codex", () => {
    expect(buildAgent({ kind: "cx", protocol: "codex" })).toBeInstanceOf(CodexAgent);
  });

  it("builds a ClaudeCodeAgent for protocol claudecode", () => {
    expect(buildAgent({ kind: "cc", protocol: "claudecode" })).toBeInstanceOf(ClaudeCodeAgent);
  });

  it("throws on an unknown protocol — no silent fallback", () => {
    expect(() => buildAgent({ kind: "x", protocol: "wat" as never })).toThrow(/protocol/i);
  });

  it("throws when protocol is missing — every provider must declare one", () => {
    expect(() => buildAgent({ kind: "x" })).toThrow(/protocol/i);
  });
});
