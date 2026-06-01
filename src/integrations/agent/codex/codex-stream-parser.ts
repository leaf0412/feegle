import type { AgentEvent } from "../agent-session.js";

/**
 * Parses `codex exec --json` stdout into normalized AgentEvents, one line at a
 * time. Ported from cc-connect's agent/codex/session.go.
 *
 * Stateful: `agent_message` items are buffered in `pending` and only flushed as
 * `text` at `turn.completed`; the arrival of a tool item flushes them as
 * `thinking` first (they were intermediate reasoning, not the final answer).
 */
export class CodexStreamParser {
  private threadId: string | undefined;
  private pending: string[] = [];

  currentSessionId(): string | undefined {
    return this.threadId;
  }

  push(line: string): AgentEvent[] {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [];
    }

    switch (raw.type) {
      case "thread.started":
        this.threadId = asString(raw.thread_id) ?? this.threadId;
        return [];
      case "turn.started":
        this.pending = [];
        return [];
      case "item.started":
        return this.handleItemStarted(asRecord(raw.item));
      case "item.completed":
        return this.handleItemCompleted(asRecord(raw.item));
      case "turn.completed":
        return [...this.flushPending("text"), { kind: "result" }];
      case "turn.failed": {
        const message = asString(asRecord(raw.error)?.message) ?? "turn failed (no details)";
        return [{ kind: "error", text: message }];
      }
      default:
        return [];
    }
  }

  private flushPending(kind: "thinking" | "text"): AgentEvent[] {
    const events = this.pending.map((text) => ({ kind, text }) as AgentEvent);
    this.pending = [];
    return events;
  }

  private handleItemStarted(item: Record<string, unknown> | undefined): AgentEvent[] {
    if (!item) return [];
    const itemType = asString(item.type);
    if (itemType === "agent_message" || itemType === "message" || itemType === "reasoning") {
      return [];
    }
    // A tool started: flush buffered messages as thinking, then announce the tool.
    const events = this.flushPending("thinking");
    if (itemType === "command_execution") {
      events.push({ kind: "tool_use", tool: "Bash" });
    } else if (itemType === "function_call") {
      events.push({ kind: "tool_use", tool: asString(item.name) ?? "" });
    }
    return events;
  }

  private handleItemCompleted(item: Record<string, unknown> | undefined): AgentEvent[] {
    if (!item) return [];
    switch (asString(item.type)) {
      case "reasoning": {
        const text = extractItemText(item, "summary", "summary_text");
        return text ? [{ kind: "thinking", text }] : [];
      }
      case "agent_message":
      case "message": {
        const text = extractItemText(item, "content", "output_text");
        if (text) this.pending.push(text);
        return [];
      }
      case "command_execution":
        return [
          { kind: "tool_result", tool: "Bash", text: (asString(item.aggregated_output) ?? "").trim() }
        ];
      case "function_call":
        return [
          { kind: "tool_result", tool: asString(item.name) ?? "", text: (asString(item.output) ?? "").trim() }
        ];
      default:
        return [];
    }
  }
}

/** Reads text from a Codex item: an array of typed {text} blocks, else item.text. */
function extractItemText(
  item: Record<string, unknown>,
  arrayField: string,
  elementType: string
): string {
  const arr = item[arrayField];
  if (Array.isArray(arr)) {
    const parts = arr
      .map((element) => asRecord(element))
      .filter((element): element is Record<string, unknown> => {
        if (!element) return false;
        return elementType === "" || asString(element.type) === elementType;
      })
      .map((element) => asString(element.text))
      .filter((text): text is string => Boolean(text));
    if (parts.length > 0) return parts.join("\n");
  }
  return asString(item.text) ?? "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
