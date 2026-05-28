import { describe, expect, it } from "vitest";
import { translateAcpSessionUpdate } from "../../src/agent/acp-event-translation.js";

describe("translateAcpSessionUpdate", () => {
  it("translates agent_thought_chunk to a thinking event so the progress card shows reasoning", () => {
    const out = translateAcpSessionUpdate({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "considering options" }
    });
    expect(out).toEqual({ progress: { kind: "thinking", text: "considering options" } });
  });

  it("accumulates agent_message_chunk into the final answer (no progress event)", () => {
    const out = translateAcpSessionUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello" }
    });
    expect(out).toEqual({ answerChunk: "Hello" });
  });

  it("translates tool_call to tool_use carrying the title and call id", () => {
    const out = translateAcpSessionUpdate({
      sessionUpdate: "tool_call",
      toolCallId: "call_1",
      title: "Reading files"
    });
    expect(out).toEqual({
      progress: { kind: "tool_use", text: "Reading files", tool: "call_1" }
    });
  });

  it("translates tool_call_update to tool_result", () => {
    const out = translateAcpSessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "call_1",
      title: "Reading files",
      status: "completed"
    });
    expect(out).toEqual({
      progress: { kind: "tool_result", text: "Reading files", tool: "call_1" }
    });
  });

  it("returns null for ignored kinds so unhandled events do not pollute the card", () => {
    expect(translateAcpSessionUpdate({ sessionUpdate: "usage_update" })).toBeNull();
    expect(translateAcpSessionUpdate({ sessionUpdate: "available_commands_update" })).toBeNull();
  });
});
