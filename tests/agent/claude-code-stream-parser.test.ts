import { describe, expect, it } from "vitest";
import { ClaudeCodeStreamParser } from "@integrations/agent/claude-code/claude-code-stream-parser.js";
import type { AgentEvent } from "@integrations/agent/agent-session.js";

// Representative `claude --output-format stream-json` stdout. Shapes mirror
// cc-connect's agent/claudecode/session.go.
const LINES: ReadonlyArray<string> = [
  JSON.stringify({ type: "system", session_id: "sess_c" }),
  JSON.stringify({ type: "assistant", message: { content: [{ type: "thinking", thinking: "let me check" }] } }),
  JSON.stringify({
    type: "assistant",
    message: { content: [{ type: "tool_use", name: "Read", input: { file: "x.ts" } }] }
  }),
  JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "All good." }] } }),
  JSON.stringify({ type: "result", result: "All good.", session_id: "sess_c" })
];

function runParser(lines: ReadonlyArray<string>): {
  events: AgentEvent[];
  sessionId: string | undefined;
} {
  const parser = new ClaudeCodeStreamParser();
  const events: AgentEvent[] = [];
  for (const line of lines) events.push(...parser.push(line));
  return { events, sessionId: parser.currentSessionId() };
}

describe("ClaudeCodeStreamParser", () => {
  it("normalizes claude stream-json content blocks into agent events", () => {
    const { events } = runParser(LINES);
    expect(events).toEqual([
      { kind: "thinking", text: "let me check" },
      { kind: "tool_use", tool: "Read" },
      { kind: "text", text: "All good." },
      { kind: "result" }
    ]);
  });

  it("captures the session id from the system event", () => {
    expect(runParser(LINES).sessionId).toBe("sess_c");
  });

  it("ignores control_request (permission) events — we run without permission prompts", () => {
    const parser = new ClaudeCodeStreamParser();
    const events = parser.push(JSON.stringify({ type: "control_request", request: { subtype: "can_use_tool" } }));
    expect(events).toEqual([]);
  });
});
