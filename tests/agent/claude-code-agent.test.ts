import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ClaudeCodeAgent,
  buildClaudeCodeArgs
} from "@integrations/agent/claude-code/claude-code-agent.js";
import type { AgentEvent } from "@integrations/agent/agent-session.js";

// claude's argv starts with leading-dash flags (-p --output-format …), which
// `node -e SCRIPT` would mis-parse as node options. Write the fake CLIs to temp
// files instead — `node <file> …` passes the rest straight to the script.
const FAKE_CLAUDE_PATH = join(tmpdir(), "feegle-fake-claude.js");
const FAIL_CLAUDE_PATH = join(tmpdir(), "feegle-fail-claude.js");

beforeAll(() => {
  // Fake claude: read the prompt from stdin, emit `--output-format stream-json`
  // events (system with session id, an assistant text block, result).
  writeFileSync(
    FAKE_CLAUDE_PATH,
    "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{" +
      "process.stdout.write(JSON.stringify({type:'system',session_id:'sess_1'})+'\\n');" +
      "process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'claude:'+d.trim()}]}})+'\\n');" +
      "process.stdout.write(JSON.stringify({type:'result',result:'done',session_id:'sess_1'})+'\\n');" +
      "});"
  );
  writeFileSync(FAIL_CLAUDE_PATH, "process.stderr.write('boom: claude auth');process.exit(5);");
});

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

describe("buildClaudeCodeArgs", () => {
  it("runs print mode streaming json in skip-permissions (yolo) mode, no permission tool", () => {
    const args = buildClaudeCodeArgs({});
    expect(args).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions"
    ]);
    expect(args).not.toContain("--permission-prompt-tool");
  });

  it("adds --model and --resume when provided", () => {
    expect(buildClaudeCodeArgs({ model: "claude-sonnet-4-6", resumeSessionId: "sess_9" })).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
      "--model",
      "claude-sonnet-4-6",
      "--resume",
      "sess_9"
    ]);
  });
});

describe("ClaudeCodeAgent", () => {
  it("feeds the prompt on stdin and streams parsed events, capturing the session id", async () => {
    const agent = new ClaudeCodeAgent({ command: "node", args: [FAKE_CLAUDE_PATH] });
    const session = agent.startSession();

    const events = await drain(session.send("ship it"));

    expect(events).toEqual([{ kind: "text", text: "claude:ship it" }, { kind: "result" }]);
    expect(session.currentSessionId()).toBe("sess_1");
    await session.close();
  }, 15_000);

  it("surfaces a non-zero exit with stderr", async () => {
    const agent = new ClaudeCodeAgent({ command: "node", args: [FAIL_CLAUDE_PATH] });
    const session = agent.startSession();
    await expect(drain(session.send("x"))).rejects.toThrow(/code 5.*boom: claude auth/s);
    await session.close();
  }, 15_000);
});
