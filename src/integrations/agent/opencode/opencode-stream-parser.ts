import type { AgentEvent } from "../agent-session.js";

/**
 * Parses `opencode run --format json` stdout (NDJSON) into normalized
 * AgentEvents, one line at a time. Non-JSON lines (terminal title/OSC noise)
 * are skipped. Ported from cc-connect's agent/opencode/session.go handleEvent.
 *
 * Stateful only for the captured session id (from step_start); every other
 * line maps independently.
 */
export class OpencodeStreamParser {
  private sessionId: string | undefined;

  currentSessionId(): string | undefined {
    return this.sessionId;
  }

  push(line: string): AgentEvent[] {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return []; // not JSON → terminal noise, skip
    }

    const type = raw.type;
    const part = asRecord(raw.part);

    switch (type) {
      case "text":
        return this.handleText(part);
      case "reasoning": {
        const text = asString(part?.text);
        return text ? [{ kind: "thinking", text }] : [];
      }
      case "tool_use":
        return handleToolUse(part);
      case "step_start":
        this.sessionId =
          asString(raw.sessionID) ?? asString(part?.sessionID) ?? this.sessionId;
        return [];
      case "step_finish":
        return part?.reason === "stop" ? [{ kind: "result" }] : [];
      case "error":
        return [{ kind: "error", text: extractErrorMessage(raw) }];
      default:
        return [];
    }
  }

  private handleText(part: Record<string, unknown> | undefined): AgentEvent[] {
    if (!part) return [];
    // synthetic compaction_continue is opencode's internal continuation signal,
    // not user-facing content.
    const metadata = asRecord(part.metadata);
    if (part.synthetic === true && metadata?.compaction_continue === true) {
      return [];
    }
    const text = asString(part.text);
    return text ? [{ kind: "text", text }] : [];
  }
}

function handleToolUse(part: Record<string, unknown> | undefined): AgentEvent[] {
  if (!part) return [];
  const tool = asString(part.tool);
  const state = asRecord(part.state);
  const events: AgentEvent[] = [{ kind: "tool_use", tool }];
  if (state?.status === "completed") {
    events.push({ kind: "tool_result", tool, text: asString(state.output) ?? "" });
  }
  return events;
}

/** Pulls a human-readable message out of opencode's various error shapes. */
function extractErrorMessage(raw: Record<string, unknown>): string {
  const error = raw.error;
  if (typeof error === "string" && error) return error;
  const errObj = asRecord(error);
  if (errObj) {
    const data = asRecord(errObj.data);
    const dataMsg = asString(data?.message);
    if (dataMsg) {
      const name = asString(errObj.name);
      return name ? `${name}: ${dataMsg}` : dataMsg;
    }
    const msg = asString(errObj.message);
    if (msg) return msg;
    const name = asString(errObj.name);
    if (name) return name;
  }
  const partErr = asRecord(raw.part);
  const partMsg = asString(partErr?.error) ?? asString(partErr?.message);
  if (partMsg) return partMsg;
  return asString(raw.message) ?? JSON.stringify(raw);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
