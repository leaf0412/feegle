import type { AgentEvent } from "../agent-session.js";

/**
 * Parses `claude --output-format stream-json` stdout into normalized
 * AgentEvents, one line at a time. Ported from cc-connect's
 * agent/claudecode/session.go.
 *
 * `control_request` / `control_cancel_request` (permission round-trips) are
 * ignored — feegle runs Claude Code without permission prompts.
 */
export class ClaudeCodeStreamParser {
  private sessionId: string | undefined;

  currentSessionId(): string | undefined {
    return this.sessionId;
  }

  push(line: string): AgentEvent[] {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return [];
    }

    switch (raw.type) {
      case "system":
        this.sessionId = asString(raw.session_id) ?? this.sessionId;
        return [];
      case "assistant":
        return this.handleAssistant(raw);
      case "result":
        this.sessionId = asString(raw.session_id) ?? this.sessionId;
        return [{ kind: "result" }];
      default:
        // user (tool results), control_request/control_cancel_request → ignored
        return [];
    }
  }

  private handleAssistant(raw: Record<string, unknown>): AgentEvent[] {
    const content = asRecord(raw.message)?.content;
    if (!Array.isArray(content)) return [];

    const events: AgentEvent[] = [];
    for (const block of content) {
      const item = asRecord(block);
      if (!item) continue;
      switch (asString(item.type)) {
        case "tool_use": {
          const tool = asString(item.name);
          if (tool === "AskUserQuestion") break; // interactive, not part of headless flow
          events.push({ kind: "tool_use", tool });
          break;
        }
        case "thinking": {
          const text = asString(item.thinking);
          if (text) events.push({ kind: "thinking", text });
          break;
        }
        case "text": {
          const text = asString(item.text);
          if (text) events.push({ kind: "text", text });
          break;
        }
      }
    }
    return events;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
