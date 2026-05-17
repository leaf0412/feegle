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
    expect(calls).toEqual([
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
    ]);
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
});
