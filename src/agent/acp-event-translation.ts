import type { AgentProgressUpdate } from "./agent-cli.js";

/**
 * Translates one ACP session/update payload to either a feegle progress event,
 * a chunk of the final answer text, or null (deliberately ignored).
 * Pure: no I/O, no state. Caller accumulates `answerChunk` into the response.
 */
export type AcpTranslation =
  | { progress: AgentProgressUpdate }
  | { answerChunk: string }
  | null;

export function translateAcpSessionUpdate(update: Record<string, unknown>): AcpTranslation {
  const kind = update.sessionUpdate;
  switch (kind) {
    case "agent_message_chunk":
      return { answerChunk: extractText(update.content) };
    case "agent_thought_chunk":
      return { progress: { kind: "thinking", text: extractText(update.content) } };
    case "tool_call": {
      const title = typeof update.title === "string" ? update.title : "";
      const id = typeof update.toolCallId === "string" ? update.toolCallId : "";
      return { progress: { kind: "tool_use", text: title, tool: id } };
    }
    case "tool_call_update": {
      const title = typeof update.title === "string" ? update.title : "";
      const id = typeof update.toolCallId === "string" ? update.toolCallId : "";
      return { progress: { kind: "tool_result", text: title, tool: id } };
    }
    default:
      return null;
  }
}

function extractText(content: unknown): string {
  if (content && typeof content === "object" && "text" in content) {
    const value = (content as { text: unknown }).text;
    return typeof value === "string" ? value : "";
  }
  return "";
}
