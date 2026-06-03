import { describe, expect, it } from "vitest";
import { OpencodeStreamParser } from "@integrations/agent/opencode/opencode-stream-parser.js";
import type { AgentEvent } from "@integrations/agent/agent-session.js";

// Representative `opencode run --format json` stdout: NDJSON event lines, plus a
// non-JSON terminal-title noise line that must be skipped. Shapes mirror
// cc-connect's agent/opencode/session.go.
const LINES: ReadonlyArray<string> = [
  "]0;New session - noise", // OSC title noise → not JSON → skipped
  JSON.stringify({
    type: "step_start",
    part: { type: "step-start", sessionID: "ses_abc123" }
  }),
  JSON.stringify({ type: "reasoning", part: { type: "reasoning", text: "analyzing the bug" } }),
  JSON.stringify({
    type: "tool_use",
    part: { type: "tool", tool: "bash", state: { status: "completed", output: "exit 0" } }
  }),
  JSON.stringify({ type: "text", part: { type: "text", text: "The fix is " } }),
  JSON.stringify({ type: "text", part: { type: "text", text: "ready." } }),
  // synthetic compaction_continue is an internal signal, not real content:
  JSON.stringify({
    type: "text",
    part: { type: "text", text: "[continuing]", synthetic: true, metadata: { compaction_continue: true } }
  }),
  JSON.stringify({ type: "step_finish", part: { type: "step-finish", reason: "stop" } })
];

function runParser(lines: ReadonlyArray<string>): {
  events: AgentEvent[];
  sessionId: string | undefined;
} {
  const parser = new OpencodeStreamParser();
  const events: AgentEvent[] = [];
  for (const line of lines) {
    events.push(...parser.push(line));
  }
  return { events, sessionId: parser.currentSessionId() };
}

describe("OpencodeStreamParser", () => {
  it("normalizes opencode NDJSON into agent events, skipping non-JSON noise", () => {
    const { events } = runParser(LINES);

    expect(events).toEqual([
      { kind: "thinking", text: "analyzing the bug" },
      { kind: "tool_use", tool: "bash" },
      { kind: "tool_result", tool: "bash", text: "exit 0" },
      { kind: "text", text: "The fix is " },
      { kind: "text", text: "ready." },
      { kind: "result" }
    ]);
  });

  it("captures the session id from step_start for later resume", () => {
    const { sessionId } = runParser(LINES);
    expect(sessionId).toBe("ses_abc123");
  });

  it("surfaces an opencode error event as an error", () => {
    const parser = new OpencodeStreamParser();
    const events = parser.push(
      JSON.stringify({ type: "error", error: { data: { message: "model overloaded" }, name: "ProviderError" } })
    );
    expect(events).toEqual([{ kind: "error", text: "ProviderError: model overloaded" }]);
  });
});
