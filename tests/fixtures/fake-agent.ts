import type { Agent, AgentEvent, AgentSession } from "@integrations/agent/agent-session.js";

/**
 * An {@link Agent} whose session replays a fixed event sequence (per prompt).
 * The streaming-interface counterpart of the old fake AgentCli.
 */
export function fakeAgentFromEvents(make: (prompt: string) => AgentEvent[]): Agent {
  return {
    startSession(): AgentSession {
      let lastSessionId: string | undefined;
      return {
        async *send(prompt: string): AsyncIterable<AgentEvent> {
          for (const event of make(prompt)) {
            yield event;
          }
        },
        currentSessionId: () => lastSessionId,
        async close() {
          lastSessionId = undefined;
        }
      };
    }
  };
}

/** An Agent that streams a single text answer then a result (the common case). */
export function fakeTextAgent(answer: string | ((prompt: string) => string)): Agent {
  return fakeAgentFromEvents((prompt) => [
    { kind: "text", text: typeof answer === "function" ? answer(prompt) : answer },
    { kind: "result" }
  ]);
}

/** A text Agent that also records every prompt it received, for invocation asserts. */
export function recordingAgent(answer: string): { agent: Agent; prompts: string[] } {
  const prompts: string[] = [];
  const agent = fakeAgentFromEvents((prompt) => {
    prompts.push(prompt);
    return [{ kind: "text", text: answer }, { kind: "result" }];
  });
  return { agent, prompts };
}
