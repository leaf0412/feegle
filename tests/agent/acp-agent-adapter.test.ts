import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { AcpAgentAdapter } from "../../src/agent/acp-agent-adapter.js";
import type { AgentProgressUpdate } from "../../src/agent/agent-cli.js";

const require = createRequire(import.meta.url);
const exampleAgentPath = require.resolve("@agentclientprotocol/sdk/dist/examples/agent.js");

describe("AcpAgentAdapter (integration against SDK example agent)", () => {
  it("drives a full prompt turn and returns the agent's final text", async () => {
    const adapter = new AcpAgentAdapter({
      command: "node",
      args: [exampleAgentPath]
    });
    const events: AgentProgressUpdate[] = [];
    const result = await adapter.chat(
      [{ role: "user", content: "do something" }],
      {
        cwd: process.cwd(),
        onProgress: (u) => { events.push(u); }
      }
    );
    // The example agent emits message chunks → accumulated answer is non-empty.
    expect(result.length).toBeGreaterThan(0);
    // It emits both tool_call and tool_call_update → adapter saw both event kinds.
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has("tool_use")).toBe(true);
    expect(kinds.has("tool_result")).toBe(true);
  }, 30_000);  // 30s timeout — generous for the subprocess

  it("calls onAssign with the freshly-created ACP session id so the store can persist it", async () => {
    const adapter = new AcpAgentAdapter({
      command: "node",
      args: [exampleAgentPath]
    });
    let assigned: string | undefined;
    await adapter.chat(
      [{ role: "user", content: "do something" }],
      {
        cwd: process.cwd(),
        sessionContext: {
          onAssign: (id) => { assigned = id; }
        }
      }
    );
    expect(assigned).toBeTruthy();
    expect(typeof assigned).toBe("string");
    expect(assigned!.length).toBeGreaterThan(0);
  }, 30_000);
});
