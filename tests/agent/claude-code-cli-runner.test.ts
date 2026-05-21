import { describe, expect, it } from "vitest";
import { createClaudeCodeCliPromptRunner } from "../../src/agent/claude-code-cli-runner.js";

describe("createClaudeCodeCliPromptRunner", () => {
  it("runs Claude Code in stream-json print mode and returns the final result", async () => {
    const calls: unknown[] = [];
    const runner = createClaudeCodeCliPromptRunner(
      {
        command: "claude",
        cwd: "/tmp/workspace",
        timeoutMs: 1234
      },
      async (command, args, options) => {
        calls.push({ command, args, options });
        return {
          stdout: [
            JSON.stringify({
              type: "system",
              session_id: "session_1"
            }),
            JSON.stringify({
              type: "result",
              result: "Claude 完成了处理"
            })
          ].join("\n"),
          stderr: ""
        };
      }
    );

    await expect(runner("hello claude")).resolves.toBe("Claude 完成了处理");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject(
      {
        command: "claude",
        args: [
          "-p",
          "--output-format",
          "stream-json",
          "--input-format",
          "stream-json",
          "--verbose"
        ],
        options: {
          cwd: "/tmp/workspace",
          input: `${JSON.stringify({
            type: "user",
            message: {
              role: "user",
              content: [{ type: "text", text: "hello claude" }]
            }
          })}\n`,
          timeout: 1234
        }
      }
    );
  });

  it("reports Claude Code error results emitted before a non-zero exit", async () => {
    const runner = createClaudeCodeCliPromptRunner(
      {
        command: "claude",
        cwd: "/tmp/workspace"
      },
      async () => {
        const error = new Error("Command failed with exit code 1") as Error & { stdout: string };
        error.stdout = JSON.stringify({
          type: "result",
          is_error: true,
          result: "Not logged in · Please run /login"
        });
        throw error;
      }
    );

    await expect(runner("hello claude")).rejects.toThrow("Not logged in · Please run /login");
  });

  it("emits progress updates from assistant and tool events", async () => {
    const runner = createClaudeCodeCliPromptRunner(
      {
        command: "claude",
        cwd: "/tmp/workspace"
      },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "text", text: "我先看一下代码。" }]
            }
          }),
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }]
            }
          }),
          JSON.stringify({
            type: "user",
            message: {
              content: [{ type: "tool_result", tool_use_id: "tool_1", content: "passed" }]
            }
          }),
          JSON.stringify({
            type: "result",
            result: "Claude 完成了处理"
          })
        ].join("\n"),
        stderr: ""
      })
    );
    const updates: unknown[] = [];

    await expect(
      runner("hello claude", {
        onProgress(update) {
          updates.push(update);
        }
      })
    ).resolves.toBe("Claude 完成了处理");

    expect(updates).toEqual([
      { kind: "thinking", text: "我先看一下代码。" },
      { kind: "tool_use", tool: "Bash", text: "{\"command\":\"npm test\"}" },
      { kind: "tool_result", text: "passed" }
    ]);
  });

  it("emits non-empty Claude thinking content as progress without exposing signatures", async () => {
    const runner = createClaudeCodeCliPromptRunner(
      {
        command: "claude",
        cwd: "/tmp/workspace"
      },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "thinking", thinking: "I should inspect the project structure.", signature: "opaque" }]
            }
          }),
          JSON.stringify({
            type: "result",
            result: "done"
          })
        ].join("\n"),
        stderr: ""
      })
    );
    const updates: unknown[] = [];

    await expect(
      runner("hello claude", {
        onProgress(update) {
          updates.push(update);
        }
      })
    ).resolves.toBe("done");

    expect(updates).toEqual([{ kind: "thinking", text: "I should inspect the project structure." }]);
    expect(JSON.stringify(updates)).not.toContain("opaque");
  });

  it("does not treat the final result as progress when assistant text already described the process", async () => {
    const runner = createClaudeCodeCliPromptRunner(
      {
        command: "claude",
        cwd: "/tmp/workspace"
      },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "text", text: "我正在检查相关文件。" }]
            }
          }),
          JSON.stringify({
            type: "result",
            result: "最终答案"
          })
        ].join("\n"),
        stderr: ""
      })
    );
    const updates: unknown[] = [];

    await expect(
      runner("hello claude", {
        onProgress(update) {
          updates.push(update);
        }
      })
    ).resolves.toBe("最终答案");

    expect(updates).toEqual([{ kind: "thinking", text: "我正在检查相关文件。" }]);
  });

  it("emits progress from streamed JSON lines before the command resolves", async () => {
    let resolveCommand: ((value: { stdout: string; stderr: string }) => void) | undefined;
    const commandDone = new Promise<{ stdout: string; stderr: string }>((resolve) => {
      resolveCommand = resolve;
    });
    const updates: unknown[] = [];
    const milestones: string[] = [];
    const runner = createClaudeCodeCliPromptRunner(
      {
        command: "claude",
        cwd: "/tmp/workspace"
      },
      async (_command, _args, options) => {
        await options.onStdoutLine?.(
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }]
            }
          })
        );
        milestones.push("line-emitted");
        return commandDone;
      }
    );

    const result = runner("hello claude", {
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
        type: "result",
        result: "done"
      }),
      stderr: ""
    });
    await expect(result).resolves.toBe("done");
    expect(updates).toEqual([{ kind: "tool_use", tool: "Bash", text: "{\"command\":\"npm test\"}" }]);
  });

  it("waits for each async progress callback before emitting the next update", async () => {
    const runner = createClaudeCodeCliPromptRunner(
      {
        command: "claude",
        cwd: "/tmp/workspace"
      },
      async () => ({
        stdout: [
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "text", text: "我先看一下代码。" }]
            }
          }),
          JSON.stringify({
            type: "assistant",
            message: {
              content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }]
            }
          }),
          JSON.stringify({
            type: "result",
            result: "Claude 完成了处理"
          })
        ].join("\n"),
        stderr: ""
      })
    );
    const events: string[] = [];

    await runner("hello claude", {
      async onProgress(update) {
        events.push(`start:${update.kind}`);
        await Promise.resolve();
        events.push(`end:${update.kind}`);
      }
    });

    expect(events).toEqual([
      "start:thinking",
      "end:thinking",
      "start:tool_use",
      "end:tool_use"
    ]);
  });
});
