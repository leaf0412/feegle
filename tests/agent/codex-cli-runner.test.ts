import { describe, expect, it } from "vitest";
import { createCodexCliPromptRunner } from "../../src/agent/codex-cli-runner.js";

describe("createCodexCliPromptRunner", () => {
  it("runs codex exec json mode with the prompt on stdin", async () => {
    const calls: unknown[] = [];
    const runner = createCodexCliPromptRunner(
      {
        command: "codex",
        cwd: "/tmp/workspace",
        sandbox: "workspace-write",
        approvalPolicy: "never",
        timeoutMs: 1234
      },
      async (command, args, options) => {
        calls.push({ command, args, options });
        return {
          stdout: [
            JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
            JSON.stringify({
              type: "item.completed",
              item: { type: "agent_message", content: [{ type: "output_text", text: "agent result" }] }
            }),
            JSON.stringify({ type: "turn.completed" })
          ].join("\n"),
          stderr: ""
        };
      }
    );

    await expect(runner("hello agent")).resolves.toBe("agent result");
    expect(calls).toEqual([
      {
        command: "codex",
        args: [
          "--ask-for-approval",
          "never",
          "exec",
          "--skip-git-repo-check",
          "--cd",
          "/tmp/workspace",
          "--sandbox",
          "workspace-write",
          "--json",
          "-"
        ],
        options: {
          cwd: "/tmp/workspace",
          input: "hello agent",
          timeout: 1234
        }
      }
    ]);
  });

  it("joins multiple completed message text parts with newlines", async () => {
    const runner = createCodexCliPromptRunner(
      { command: "codex", cwd: "/tmp/workspace" },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "item.completed",
            item: {
              type: "message",
              content: [
                { type: "output_text", text: "line one" },
                { type: "output_text", text: "line two" }
              ]
            }
          }),
          JSON.stringify({ type: "turn.completed" })
        ].join("\n"),
        stderr: ""
      })
    );

    await expect(runner("hello agent")).resolves.toBe("line one\nline two");
  });

  it("emits progress updates from completed tool and message events", async () => {
    const runner = createCodexCliPromptRunner(
      { command: "codex", cwd: "/tmp/workspace" },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "item.completed",
            item: { type: "tool_call", name: "Bash", arguments: "npm test" }
          }),
          JSON.stringify({
            type: "item.completed",
            item: { type: "tool_result", name: "Bash", output: "passed" }
          }),
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: "done" }
          }),
          JSON.stringify({ type: "turn.completed" })
        ].join("\n"),
        stderr: ""
      })
    );
    const updates: unknown[] = [];

    await expect(
      runner("hello agent", {
        onProgress(update) {
          updates.push(update);
        }
      })
    ).resolves.toBe("done");

    expect(updates).toEqual([
      { kind: "tool_use", tool: "Bash", text: "npm test" },
      { kind: "tool_result", tool: "Bash", text: "passed" },
      { kind: "thinking", text: "done" }
    ]);
  });
});
