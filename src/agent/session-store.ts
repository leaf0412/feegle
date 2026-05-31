import type { Statement } from "better-sqlite3";
import { z } from "zod";
import type { RuntimeDb } from "../infra/app/runtime-db.js";

/**
 * A SessionRecord captures the per-chat session state: which agent kind is
 * pinned, optional human label, and the usual created/last-active timestamps +
 * active/closed status. (`acpSessionId` / the `acp_session_id` column are a
 * legacy orphan kept only so old sessions.json migrations don't lose data; no
 * live code writes them anymore.)
 *
 * Storage: SQLite table `sessions`. The zod schema is kept exported so external
 * code that imported the type (e.g. for command handlers) keeps compiling; it
 * is also used by the boot migrator to validate legacy JSON input.
 */
export const SessionRecordSchema = z.object({
  sessionKey: z.string().min(1),
  name: z.string().min(1).optional(),
  agentKind: z.string().min(1).optional(),
  acpSessionId: z.string().min(1).optional(),
  quiet: z.boolean().optional(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  status: z.enum(["active", "closed"])
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export interface SessionUpsertOptions {
  agentKind?: string;
  name?: string;
}

export interface SessionStoreOptions {
  clock?: () => Date;
}

interface SessionRow {
  session_key: string;
  name: string | null;
  agent_kind: string | null;
  acp_session_id: string | null;
  quiet: number;
  created_at: string;
  last_active_at: string;
  status: "active" | "closed";
}

function rowToRecord(row: SessionRow): SessionRecord {
  const record: SessionRecord = {
    sessionKey: row.session_key,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    status: row.status
  };
  if (row.name !== null) record.name = row.name;
  if (row.agent_kind !== null) record.agentKind = row.agent_kind;
  if (row.acp_session_id !== null) record.acpSessionId = row.acp_session_id;
  // quiet is stored 0/1; only surface when truthy to keep the legacy shape
  // (the old JSON file omitted `quiet` entirely when false).
  if (row.quiet === 1) record.quiet = true;
  return record;
}

// LIKE prefix-escape: real session keys could in principle contain `%` or `_`
// (SQL wildcards). Escape with backslash + match using `ESCAPE '\'`.
function escapeLikePrefix(prefix: string): string {
  return prefix.replace(/[\\%_]/g, "\\$&");
}

export class SessionStore {
  private readonly clock: () => Date;
  private readonly listStmt: Statement;
  private readonly listByPrefixStmt: Statement;
  private readonly getStmt: Statement;
  private readonly insertStmt: Statement;
  private readonly assignAgentStmt: Statement;
  private readonly touchStmt: Statement;
  private readonly renameStmt: Statement;
  private readonly setQuietStmt: Statement;
  private readonly closeStmt: Statement;
  private readonly reopenStmt: Statement;
  private readonly removeStmt: Statement;

  constructor(
    db: RuntimeDb,
    options: SessionStoreOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.listStmt = db.prepare(
      `select session_key, name, agent_kind, acp_session_id, quiet, created_at, last_active_at, status
         from sessions order by created_at`
    );
    this.listByPrefixStmt = db.prepare(
      `select session_key, name, agent_kind, acp_session_id, quiet, created_at, last_active_at, status
         from sessions where session_key like ? escape '\\' order by created_at`
    );
    this.getStmt = db.prepare(
      `select session_key, name, agent_kind, acp_session_id, quiet, created_at, last_active_at, status
         from sessions where session_key = ?`
    );
    this.insertStmt = db.prepare(
      `insert into sessions(session_key, name, agent_kind, acp_session_id, quiet, created_at, last_active_at, status)
         values (@session_key, @name, @agent_kind, @acp_session_id, @quiet, @created_at, @last_active_at, @status)`
    );
    this.assignAgentStmt = db.prepare(
      `update sessions set agent_kind = ?, last_active_at = ?, status = 'active' where session_key = ?`
    );
    this.touchStmt = db.prepare(
      `update sessions set last_active_at = ?, status = 'active' where session_key = ?`
    );
    this.renameStmt = db.prepare(
      `update sessions set name = ? where session_key = ?`
    );
    this.setQuietStmt = db.prepare(
      `update sessions set quiet = ? where session_key = ?`
    );
    this.closeStmt = db.prepare(
      `update sessions set status = 'closed', last_active_at = ? where session_key = ?`
    );
    this.reopenStmt = db.prepare(
      `update sessions set status = 'active', last_active_at = ? where session_key = ?`
    );
    this.removeStmt = db.prepare(`delete from sessions where session_key = ?`);
  }

  list(): SessionRecord[] {
    const rows = this.listStmt.all() as SessionRow[];
    return rows.map(rowToRecord);
  }

  listByPrefix(sessionKeyPrefix: string): SessionRecord[] {
    const escaped = escapeLikePrefix(sessionKeyPrefix);
    const rows = this.listByPrefixStmt.all(`${escaped}%`) as SessionRow[];
    return rows.map(rowToRecord);
  }

  get(sessionKey: string): SessionRecord | undefined {
    const row = this.getStmt.get(sessionKey) as SessionRow | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  async getOrCreate(sessionKey: string, options: SessionUpsertOptions = {}): Promise<SessionRecord> {
    const existing = this.get(sessionKey);
    if (existing) {
      return existing;
    }
    const now = this.clock().toISOString();
    this.insertStmt.run({
      session_key: sessionKey,
      name: options.name ?? null,
      agent_kind: options.agentKind ?? null,
      acp_session_id: null,
      quiet: 0,
      created_at: now,
      last_active_at: now,
      status: "active"
    });
    return this.get(sessionKey)!;
  }

  /**
   * Pins (or re-pins) the agent kind a session is bound to. Load balancing uses
   * it to record a new session's chosen agent, and to re-pin a session whose
   * previous agent was unregistered. Creates the session if it does not exist.
   * Unlike getOrCreate, this overwrites an existing pin.
   */
  async assignAgent(sessionKey: string, agentKind: string): Promise<SessionRecord> {
    if (!this.get(sessionKey)) {
      return this.getOrCreate(sessionKey, { agentKind });
    }
    this.assignAgentStmt.run(agentKind, this.clock().toISOString(), sessionKey);
    return this.get(sessionKey)!;
  }

  async touch(sessionKey: string): Promise<SessionRecord> {
    const result = this.touchStmt.run(this.clock().toISOString(), sessionKey);
    if (result.changes === 0) {
      throw new Error(`session not found: ${sessionKey}`);
    }
    return this.get(sessionKey)!;
  }

  async rename(sessionKey: string, name: string): Promise<SessionRecord> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("session name must not be empty");
    }
    const result = this.renameStmt.run(trimmed, sessionKey);
    if (result.changes === 0) {
      throw new Error(`session not found: ${sessionKey}`);
    }
    return this.get(sessionKey)!;
  }

  async setQuiet(sessionKey: string, quiet: boolean): Promise<SessionRecord> {
    const result = this.setQuietStmt.run(quiet ? 1 : 0, sessionKey);
    if (result.changes === 0) {
      throw new Error(`session not found: ${sessionKey}`);
    }
    return this.get(sessionKey)!;
  }

  async close(sessionKey: string): Promise<SessionRecord> {
    const result = this.closeStmt.run(this.clock().toISOString(), sessionKey);
    if (result.changes === 0) {
      throw new Error(`session not found: ${sessionKey}`);
    }
    return this.get(sessionKey)!;
  }

  async reopen(sessionKey: string): Promise<SessionRecord> {
    const result = this.reopenStmt.run(this.clock().toISOString(), sessionKey);
    if (result.changes === 0) {
      throw new Error(`session not found: ${sessionKey}`);
    }
    return this.get(sessionKey)!;
  }

  async remove(sessionKey: string): Promise<boolean> {
    const result = this.removeStmt.run(sessionKey);
    return result.changes > 0;
  }
}
