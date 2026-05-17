import { describe, expect, it } from "vitest";
import { createFeegleAgent } from "../../src/agent/agent-factory.js";

describe("createFeegleAgent", () => {
  it("creates a Claude Code agent when requested", async () => {
    const calls: unknown[] = [];
    const configured = createFeegleAgent(
      {
        kind: "claude_code",
        command: "claude",
        cwd: "/tmp/workspace",
        timeoutMs: 1234
      },
      {
        createClaudeCodePromptRunner: (options) => {
          calls.push(options);
          return async () => "Claude Code result";
        },
        createCodexPromptRunner: () => {
          throw new Error("Codex runner should not be created");
        }
      }
    );

    await expect(
      configured.agent.generatePlan({
        requirementId: "om_1",
        title: "hello",
        requirementText: "hello"
      })
    ).resolves.toBe("Claude Code result");
    expect(configured.displayName).toBe("Claude Code");
    expect(calls).toEqual([{ command: "claude", cwd: "/tmp/workspace", timeoutMs: 1234 }]);
  });

  it("keeps Codex as the default agent", () => {
    const configured = createFeegleAgent(
      {
        cwd: "/tmp/workspace"
      },
      {
        createClaudeCodePromptRunner: () => {
          throw new Error("Claude Code runner should not be created");
        },
        createCodexPromptRunner: () => async () => "Codex result"
      }
    );

    expect(configured.displayName).toBe("Codex");
  });
});
