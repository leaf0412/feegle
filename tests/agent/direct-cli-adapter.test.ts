import { describe, expect, it } from "vitest";
import { DirectCliAdapter } from "../../src/agent/direct-cli-adapter.js";

// Fake CLI: reads the whole prompt from stdin, writes a run-log line to stderr
// (which the adapter must ignore), and echoes the prompt back on stdout prefixed
// with ANSWER: — proving the prompt reached stdin and stdout becomes the answer.
const ECHO_CLI =
  "let d='';process.stdin.on('data',c=>d+=c);" +
  "process.stdin.on('end',()=>{process.stderr.write('run log noise\\n');" +
  "process.stdout.write('ANSWER:'+d.trim())});";

// Fake CLI that fails: writes a diagnostic to stderr and exits non-zero.
const FAIL_CLI = "process.stderr.write('boom: model auth failed');process.exit(3);";

describe("DirectCliAdapter", () => {
  it("feeds the prompt on stdin and returns stdout as the answer, ignoring stderr", async () => {
    const adapter = new DirectCliAdapter({ command: "node", args: ["-e", ECHO_CLI] });
    const result = await adapter.chat([{ role: "user", content: "hello there" }]);
    // flattenChat serializes the turn → "User: hello there" reaches stdin → echoed.
    expect(result).toBe("ANSWER:User: hello there");
  }, 15_000);

  it("surfaces a non-zero exit with the exit code and stderr, never swallowing it", async () => {
    const adapter = new DirectCliAdapter({ command: "node", args: ["-e", FAIL_CLI] });
    await expect(adapter.chat([{ role: "user", content: "x" }])).rejects.toThrow(
      /code 3.*boom: model auth failed/s
    );
  }, 15_000);

  it("reports a clear error when the command cannot be spawned", async () => {
    const adapter = new DirectCliAdapter({
      command: "feegle-no-such-binary-xyz",
      args: []
    });
    await expect(adapter.chat([{ role: "user", content: "x" }])).rejects.toThrow(
      /failed to spawn/
    );
  }, 15_000);

  it("kills the process and rejects when it exceeds the timeout", async () => {
    const adapter = new DirectCliAdapter({
      command: "node",
      args: ["-e", "setTimeout(()=>{}, 60000)"],
      timeoutMs: 300
    });
    await expect(adapter.chat([{ role: "user", content: "x" }])).rejects.toThrow(/timed out/);
  }, 15_000);
});
