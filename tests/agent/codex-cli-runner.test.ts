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
        const outputFlagIndex = args.indexOf("--output-last-message");
        const outputPath = args[outputFlagIndex + 1];
        if (!outputPath) {
          throw new Error("missing output path");
        }
        await import("node:fs/promises").then((fs) => fs.writeFile(outputPath, "agent result\n"));
        return { stdout: " agent result \n", stderr: "" };
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
          "--cd",
          "/tmp/workspace",
          "--sandbox",
          "workspace-write",
          "--output-last-message",
          expect.any(String),
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
