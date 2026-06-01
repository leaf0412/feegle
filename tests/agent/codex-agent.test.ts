import { describe, expect, it } from "vitest";
import { CodexAgent, buildCodexArgs } from "@integrations/agent/codex/codex-agent.js";
import type { AgentEvent } from "@integrations/agent/agent-session.js";

// Fake codex: read the prompt from stdin, emit `codex exec --json` events
// (thread.started, a buffered agent_message, turn.completed).
const FAKE_CODEX =
  "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{" +
  "process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'th_1'})+'\\n');" +
  "process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',content:[{type:'output_text',text:'codex:'+d.trim()}]}})+'\\n');" +
  "process.stdout.write(JSON.stringify({type:'turn.completed'})+'\\n');" +
  "});";

const FAIL_CODEX = "process.stderr.write('boom: codex auth');process.exit(4);";

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of stream) out.push(event);
  return out;
}

describe("buildCodexArgs", () => {
  it("runs codex exec --json in yolo (bypass approvals) mode, reading prompt from stdin", () => {
    expect(buildCodexArgs({})).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "--json",
      "-"
    ]);
  });

  it("adds --model when provided", () => {
    expect(buildCodexArgs({ model: "gpt-5" })).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "--model",
      "gpt-5",
      "--json",
      "-"
    ]);
  });

  it("uses exec resume with the thread id when resuming", () => {
    expect(buildCodexArgs({ resumeSessionId: "th_9" })).toEqual([
      "exec",
      "resume",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "th_9",
      "--json",
      "-"
    ]);
  });
});

describe("CodexAgent", () => {
  it("feeds the prompt on stdin and streams parsed events, capturing the thread id", async () => {
    const agent = new CodexAgent({ command: "node", args: ["-e", FAKE_CODEX] });
    const session = agent.startSession();

    const events = await drain(session.send("ship it"));

    expect(events).toEqual([{ kind: "text", text: "codex:ship it" }, { kind: "result" }]);
    expect(session.currentSessionId()).toBe("th_1");
    await session.close();
  }, 15_000);

  it("surfaces a non-zero exit with stderr", async () => {
    const agent = new CodexAgent({ command: "node", args: ["-e", FAIL_CODEX] });
    const session = agent.startSession();
    await expect(drain(session.send("x"))).rejects.toThrow(/code 4.*boom: codex auth/s);
    await session.close();
  }, 15_000);
});
