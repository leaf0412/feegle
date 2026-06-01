import type { Agent, AgentSessionOptions } from "./agent-session.js";

/**
 * Convenience facade for callers that only want the final answer string, not a
 * live event stream (scheduler kinds, plan revision, requirement agents, …):
 * open a session, run one turn, concatenate the `text` events, close, return.
 *
 * An `error` event is surfaced as a thrown error — never silently dropped. The
 * session is always closed, even on failure.
 */
export async function collectText(
  agent: Agent,
  prompt: string,
  options?: AgentSessionOptions
): Promise<string> {
  const session = agent.startSession(options);
  try {
    let answer = "";
    for await (const event of session.send(prompt)) {
      if (event.kind === "text") {
        answer += event.text ?? "";
      } else if (event.kind === "error") {
        throw new Error(event.text ?? "agent error");
      }
    }
    return answer;
  } finally {
    await session.close();
  }
}
