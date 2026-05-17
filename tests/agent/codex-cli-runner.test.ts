import { describe, expect, it } from "vitest";
import { createCodexCliPromptRunner } from "../../src/agent/codex-cli-runner.js";

describe("createCodexCliPromptRunner", () => {
  it("runs codex exec with the prompt on stdin", async () => {
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
        return { stdout: " agent result \n", stderr: "" };
      }
    );

    await expect(runner("hello agent")).resolves.toBe("agent result");
    expect(calls).toEqual([
      {
        command: "codex",
        args: [
          "exec",
          "--cd",
          "/tmp/workspace",
          "--sandbox",
          "workspace-write",
          "--ask-for-approval",
          "never",
          "-"
        ],
        options: {
          input: "hello agent",
          timeout: 1234
        }
      }
    ]);
  });
});
