import { describe, expect, it, vi } from "vitest";
import { AgentStreamParser } from "../../src/agent/agent-stream-parser.js";

describe("AgentStreamParser", () => {
  it("emits assistant text followed by more work as progress and keeps the final text as the answer", async () => {
    const onProgress = vi.fn();
    const parser = new AgentStreamParser({ onProgress });

    await parser.assistantMessage("I am checking the relevant files.");
    await parser.toolUse("Read", "src/agent/prompt-agent-adapter.ts");
    await parser.assistantMessage("Final answer.");

    expect(parser.finalize()).toBe("Final answer.");
    expect(onProgress).toHaveBeenCalledWith({ kind: "thinking", text: "I am checking the relevant files." });
    expect(onProgress).toHaveBeenCalledWith({
      kind: "tool_use",
      tool: "Read",
      text: "src/agent/prompt-agent-adapter.ts"
    });
  });

  it("uses an explicit final result as the answer and treats prior assistant text as progress", async () => {
    const updates: unknown[] = [];
    const parser = new AgentStreamParser({
      onProgress(update) {
        updates.push(update);
      }
    });

    await parser.assistantMessage("I am about to run the tests.");
    await parser.finalResult("Tests passed.");

    expect(parser.finalize()).toBe("Tests passed.");
    expect(updates).toEqual([{ kind: "thinking", text: "I am about to run the tests." }]);
  });
});
