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
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject(
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
    );
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

  it("emits progress updates from completed tool events without treating the final message as thinking", async () => {
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
      { kind: "tool_result", tool: "Bash", text: "passed" }
    ]);
  });

  it("emits reasoning summaries as thinking progress when Codex provides them", async () => {
    const runner = createCodexCliPromptRunner(
      { command: "codex", cwd: "/tmp/workspace" },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "item.completed",
            item: {
              type: "reasoning",
              summary: [{ type: "summary_text", text: "I need to inspect the tests first." }]
            }
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

    expect(updates).toEqual([{ kind: "thinking", text: "I need to inspect the tests first." }]);
  });

  it("emits progress from streamed JSON lines before the command resolves", async () => {
    let resolveCommand: ((value: { stdout: string; stderr: string }) => void) | undefined;
    const commandDone = new Promise<{ stdout: string; stderr: string }>((resolve) => {
      resolveCommand = resolve;
    });
    const updates: unknown[] = [];
    const milestones: string[] = [];
    const runner = createCodexCliPromptRunner(
      { command: "codex", cwd: "/tmp/workspace" },
      async (_command, _args, options) => {
        await options.onStdoutLine?.(
          JSON.stringify({
            type: "item.completed",
            item: { type: "tool_call", name: "Bash", arguments: "npm test" }
          })
        );
        milestones.push("line-emitted");
        return commandDone;
      }
    );

    const result = runner("hello agent", {
      onProgress(update) {
        updates.push(update);
        milestones.push(`progress:${update.kind}`);
      }
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(milestones).toEqual(["progress:tool_use"]);
    resolveCommand?.({
      stdout: JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "done" }
      }),
      stderr: ""
    });
    await expect(result).resolves.toBe("done");
    expect(updates).toEqual([{ kind: "tool_use", tool: "Bash", text: "npm test" }]);
  });

  it("treats assistant messages before more work as progress and the last assistant message as the answer", async () => {
    const runner = createCodexCliPromptRunner(
      { command: "codex", cwd: "/tmp/workspace" },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: "I am checking the relevant files." }
          }),
          JSON.stringify({
            type: "item.completed",
            item: { type: "tool_call", name: "Read", arguments: "src/agent/prompt-agent-adapter.ts" }
          }),
          JSON.stringify({
            type: "item.completed",
            item: { type: "agent_message", text: "Final answer." }
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
    ).resolves.toBe("Final answer.");

    expect(updates).toEqual([
      { kind: "thinking", text: "I am checking the relevant files." },
      { kind: "tool_use", tool: "Read", text: "src/agent/prompt-agent-adapter.ts" }
    ]);
  });

  it("waits for each async progress callback before emitting the next update", async () => {
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
            item: { type: "agent_message", text: "done" }
          }),
          JSON.stringify({ type: "turn.completed" })
        ].join("\n"),
        stderr: ""
      })
    );
    const events: string[] = [];

    await runner("hello agent", {
      async onProgress(update) {
        events.push(`start:${update.kind}`);
        await Promise.resolve();
        events.push(`end:${update.kind}`);
      }
    });

    expect(events).toEqual([
      "start:tool_use",
      "end:tool_use",
    ]);
  });
});
