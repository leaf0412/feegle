import { describe, expect, it, vi } from "vitest";
import { PromptAgentAdapter } from "@integrations/agent/prompt-agent-adapter.js";

describe("PromptAgentAdapter.chat", () => {
  it("wraps a single user message with process update guidance", async () => {
    const runner = vi.fn().mockResolvedValue("hi back");
    const adapter = new PromptAgentAdapter(runner);
    await expect(adapter.chat([{ role: "user", content: "hi" }])).resolves.toBe("hi back");
    const prompt = runner.mock.calls[0][0] as string;
    expect(prompt).toContain("Progress updates:");
    expect(prompt).toContain("brief user-facing progress updates");
    expect(prompt).toContain("## conversation");
    expect(prompt).toContain('"hi"');
  });

  it("serialises multi-turn history into a role-tagged prompt", async () => {
    const runner = vi.fn().mockResolvedValue("now I am Codex");
    const adapter = new PromptAgentAdapter(runner);
    await adapter.chat([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "what's your model?" }
    ]);
    const prompt = runner.mock.calls[0][0] as string;
    expect(prompt).toContain('"User:\\nhello');
    expect(prompt).toContain('Assistant:\\nhi');
    expect(prompt).toContain("User:\\nwhat's your model?");
    expect(prompt).toContain("Assistant:\"");
  });

  it("forwards run options so onProgress hooks reach the underlying runner", async () => {
    const onProgress = vi.fn();
    const runner = vi.fn(async (_prompt, options) => {
      options?.onProgress?.({ kind: "thinking", text: "warming up" });
      return "ok";
    });
    const adapter = new PromptAgentAdapter(runner);
    await adapter.chat([{ role: "user", content: "hi" }], { onProgress });
    expect(onProgress).toHaveBeenCalledWith({ kind: "thinking", text: "warming up" });
  });

  it("rejects when no message is provided", async () => {
    const adapter = new PromptAgentAdapter(vi.fn());
    await expect(adapter.chat([])).rejects.toThrow(/at least one message/);
  });
});
