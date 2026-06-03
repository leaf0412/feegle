import type { AgentChatMessage } from "./agent-cli.js";
import type { Agent, AgentEvent, AgentSessionOptions } from "./agent-session.js";

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
  return streamAgentText(agent, prompt, options);
}

export interface StreamAgentTextOptions extends AgentSessionOptions {
  /** Called for each non-text, non-result event (thinking / tool_use / tool_result). */
  onEvent?: (event: AgentEvent) => void | Promise<void>;
}

/**
 * Runs one turn and returns the concatenated `text` answer, forwarding every
 * progress event (thinking / tool_use / tool_result) to `onEvent` as it
 * arrives. The streaming counterpart of {@link collectText}; an `error` event
 * throws, and the session is always closed.
 */
export async function streamAgentText(
  agent: Agent,
  prompt: string,
  options?: StreamAgentTextOptions
): Promise<string> {
  const session = agent.startSession(options);
  try {
    let answer = "";
    for await (const event of session.send(prompt)) {
      if (event.kind === "text") {
        answer += event.text ?? "";
      } else if (event.kind === "error") {
        throw new Error(event.text ?? "agent error");
      } else if (event.kind !== "result") {
        await options?.onEvent?.(event);
      }
    }
    return answer;
  } finally {
    await session.close();
  }
}

/** Flattens a multi-turn history into a single prompt (callers replay context). */
export function promptFromMessages(messages: ReadonlyArray<AgentChatMessage>): string {
  return messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n");
}
