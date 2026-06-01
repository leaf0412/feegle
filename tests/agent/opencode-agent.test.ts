import { describe, expect, it } from "vitest";
import {
  OpencodeAgent,
  buildOpencodeArgs
} from "@integrations/agent/opencode/opencode-agent.js";
import type { AgentEvent } from "@integrations/agent/agent-session.js";

// Fake opencode: read the prompt from stdin, then emit NDJSON (a step_start
// carrying the session id, a text part, a step_finish) on stdout — mimicking
// `opencode run --format json`. Echoes the prompt into the text so we can prove
// stdin was consumed.
const FAKE_OPENCODE =
  "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{" +
  "process.stdout.write(JSON.stringify({type:'step_start',part:{sessionID:'ses_x'}})+'\\n');" +
  "process.stdout.write(JSON.stringify({type:'text',part:{type:'text',text:'echo:'+d.trim()}})+'\\n');" +
  "process.stdout.write(JSON.stringify({type:'step_finish',part:{reason:'stop'}})+'\\n');" +
  "});";

const FAIL_OPENCODE = "process.stderr.write('boom: spawn auth');process.exit(3);";

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

describe("buildOpencodeArgs", () => {
  it("always runs headless json in skip-permissions (yolo) mode", () => {
    expect(buildOpencodeArgs({})).toEqual([
      "run",
      "--format",
      "json",
      "--dangerously-skip-permissions"
    ]);
  });

  it("adds --model and --session when provided", () => {
    expect(buildOpencodeArgs({ model: "anthropic/claude", resumeSessionId: "ses_9" })).toEqual([
      "run",
      "--format",
      "json",
      "--dangerously-skip-permissions",
      "--model",
      "anthropic/claude",
      "--session",
      "ses_9"
    ]);
  });
});

describe("OpencodeAgent", () => {
  it("feeds the prompt on stdin and streams parsed events, capturing the session id", async () => {
    const agent = new OpencodeAgent({ command: "node", args: ["-e", FAKE_OPENCODE] });
    const session = agent.startSession();

    const events = await drain(session.send("fix login"));

    expect(events).toEqual([
      { kind: "text", text: "echo:fix login" },
      { kind: "result" }
    ]);
    expect(session.currentSessionId()).toBe("ses_x");
    await session.close();
  }, 15_000);

  it("surfaces a non-zero exit with stderr, never swallowing it", async () => {
    const agent = new OpencodeAgent({ command: "node", args: ["-e", FAIL_OPENCODE] });
    const session = agent.startSession();
    await expect(drain(session.send("x"))).rejects.toThrow(/code 3.*boom: spawn auth/s);
    await session.close();
  }, 15_000);
});
