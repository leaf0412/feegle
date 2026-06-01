/**
 * The unified agent abstraction: every supported CLI (OpenCode, Codex, Claude
 * Code, …) is driven through one `Agent` that opens an `AgentSession`, and each
 * turn streams a sequence of `AgentEvent`s normalized into one vocabulary —
 * regardless of the CLI's native stream-json shape.
 *
 * One channel per CLI, each with its own rich parser; no degraded text-only
 * path. See `_docs/specs/2026-06-01-agent-event-stream-design.md`.
 */

/** A single normalized agent output event. */
export interface AgentEvent {
  kind: "thinking" | "tool_use" | "tool_result" | "text" | "error" | "result";
  /** Content for thinking / text / tool_result / error. */
  text?: string;
  /** Tool name for tool_use / tool_result. */
  tool?: string;
}

export interface AgentSessionOptions {
  /** Working directory for the spawned CLI process. */
  cwd?: string;
  /** Native session id to resume (captured from a prior turn). */
  resumeSessionId?: string;
}

/**
 * One conversation with an agent. Each `send()` runs a turn and returns that
 * turn's event stream; the async iterable completing marks the turn done. A
 * turn that fails (non-zero exit, timeout) rejects the iteration — failures are
 * surfaced, never swallowed.
 */
export interface AgentSession {
  send(prompt: string): AsyncIterable<AgentEvent>;
  /** The CLI-side session id captured from the stream, for `--session` resume. */
  currentSessionId(): string | undefined;
  close(): Promise<void>;
}

/** A factory that opens sessions for one configured CLI. */
export interface Agent {
  startSession(options?: AgentSessionOptions): AgentSession;
}
