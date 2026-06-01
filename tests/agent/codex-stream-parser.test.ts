import { describe, expect, it } from "vitest";
import { CodexStreamParser } from "@integrations/agent/codex/codex-stream-parser.js";
import type { AgentEvent } from "@integrations/agent/agent-session.js";

// Representative `codex exec --json` stdout. Shapes mirror cc-connect's
// agent/codex/session.go: agent_message is buffered and only flushed as text at
// turn.completed; a tool first flushes pending messages as thinking.
const LINES: ReadonlyArray<string> = [
  JSON.stringify({ type: "thread.started", thread_id: "th_42" }),
  JSON.stringify({ type: "turn.started" }),
  JSON.stringify({
    type: "item.completed",
    item: { type: "reasoning", summary: [{ type: "summary_text", text: "weighing options" }] }
  }),
  JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "ls" } }),
  JSON.stringify({
    type: "item.completed",
    item: { type: "command_execution", command: "ls", aggregated_output: "file.txt", status: "completed", exit_code: 0 }
  }),
  JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", content: [{ type: "output_text", text: "The answer is 42" }] }
  }),
  JSON.stringify({ type: "turn.completed" })
];

function runParser(lines: ReadonlyArray<string>): {
  events: AgentEvent[];
  sessionId: string | undefined;
} {
  const parser = new CodexStreamParser();
  const events: AgentEvent[] = [];
  for (const line of lines) events.push(...parser.push(line));
  return { events, sessionId: parser.currentSessionId() };
}

describe("CodexStreamParser", () => {
  it("normalizes codex json events, buffering agent_message as final text on turn.completed", () => {
    const { events } = runParser(LINES);
    expect(events).toEqual([
      { kind: "thinking", text: "weighing options" },
      { kind: "tool_use", tool: "Bash" },
      { kind: "tool_result", tool: "Bash", text: "file.txt" },
      { kind: "text", text: "The answer is 42" },
      { kind: "result" }
    ]);
  });

  it("captures the thread id for resume", () => {
    expect(runParser(LINES).sessionId).toBe("th_42");
  });

  it("surfaces turn.failed as an error", () => {
    const parser = new CodexStreamParser();
    const events = parser.push(
      JSON.stringify({ type: "turn.failed", error: { message: "rate limited" } })
    );
    expect(events).toEqual([{ kind: "error", text: "rate limited" }]);
  });
});
