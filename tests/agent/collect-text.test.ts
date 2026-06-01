import { describe, expect, it } from "vitest";
import { collectText } from "@integrations/agent/collect-text.js";
import type {
  Agent,
  AgentEvent,
  AgentSession
} from "@integrations/agent/agent-session.js";

// A fake Agent whose session replays a fixed event sequence. Lets us test the
// collectText facade against the AgentSession contract without spawning a CLI.
function fakeAgent(events: ReadonlyArray<AgentEvent>): {
  agent: Agent;
  wasClosed: () => boolean;
} {
  let closed = false;
  const session: AgentSession = {
    async *send(_prompt: string): AsyncIterable<AgentEvent> {
      for (const event of events) {
        yield event;
      }
    },
    currentSessionId() {
      return undefined;
    },
    async close() {
      closed = true;
    }
  };
  return { agent: { startSession: () => session }, wasClosed: () => closed };
}

describe("collectText", () => {
  it("concatenates text events into the final answer and closes the session", async () => {
    const { agent, wasClosed } = fakeAgent([
      { kind: "thinking", text: "let me think" },
      { kind: "tool_use", tool: "read_file" },
      { kind: "text", text: "Hello, " },
      { kind: "text", text: "world" },
      { kind: "result" }
    ]);

    const answer = await collectText(agent, "hi");

    // Only text events form the answer; thinking/tool_use are progress, not content.
    expect(answer).toBe("Hello, world");
    expect(wasClosed()).toBe(true);
  });

  it("rejects with the message when an error event arrives, and still closes", async () => {
    const { agent, wasClosed } = fakeAgent([
      { kind: "text", text: "partial" },
      { kind: "error", text: "model auth failed" }
    ]);

    await expect(collectText(agent, "hi")).rejects.toThrow(/model auth failed/);
    expect(wasClosed()).toBe(true);
  });
});
