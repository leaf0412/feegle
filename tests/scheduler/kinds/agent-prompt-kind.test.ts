import { describe, expect, it } from "vitest";
import { AgentProviderRegistry } from "../../../src/agent/agent-provider-registry.js";
import { AgentPromptKind } from "../../../src/scheduler/kinds/agent-prompt-kind.js";
import { createTaskContext, makeAgent, makeTask } from "./kind-test-helpers.js";

describe("AgentPromptKind", () => {
  it("runs the requested provider and sends text output", async () => {
    const agents = new AgentProviderRegistry().register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => makeAgent("answer")
    });
    const texts: string[] = [];
    const kind = new AgentPromptKind({ agents });

    await expect(
      kind.run(
        createTaskContext({
          task: makeTask({ kind: "agent-prompt", target: { platform: "feishu", chatId: "oc_1" } }),
          notify: { sendText: async (_target, text) => { texts.push(text); }, sendCard: async () => {} }
        }),
        kind.parseParams({ provider: "codex", prompt: "Summarize", format: "text" })
      )
    ).resolves.toEqual({ outcome: "sent" });

    expect(texts).toEqual(["answer"]);
  });

  it("is silent when output has no target", async () => {
    const agents = new AgentProviderRegistry().register({
      kind: "codex",
      displayName: "Codex",
      buildAgent: () => makeAgent("answer")
    });
    const kind = new AgentPromptKind({ agents });

    await expect(
      kind.run(createTaskContext({ task: makeTask({ kind: "agent-prompt" }) }), {
        provider: "codex",
        prompt: "Summarize",
        format: "text"
      })
    ).resolves.toEqual({ outcome: "silent", note: "no target" });
  });
});
