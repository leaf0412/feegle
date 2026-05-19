import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createDefaultJsonFile, writeJsonAtomically } from "../app/json-file.js";

export const SessionRecordSchema = z.object({
  sessionKey: z.string().min(1),
  name: z.string().min(1).optional(),
  agentKind: z.string().min(1).optional(),
  quiet: z.boolean().optional(),
  createdAt: z.string(),
  lastActiveAt: z.string(),
  status: z.enum(["active", "closed"])
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

export const SessionsFileSchema = z.object({
  schemaVersion: z.literal(1),
  sessions: z.array(SessionRecordSchema)
});

export type SessionsFile = z.infer<typeof SessionsFileSchema>;

const DEFAULT: SessionsFile = {
  schemaVersion: 1,
  sessions: []
};

export interface SessionUpsertOptions {
  agentKind?: string;
  name?: string;
}

export interface SessionStoreOptions {
  clock?: () => Date;
}

export class SessionStore {
  private constructor(
    private readonly filePath: string,
    private data: SessionsFile,
    private readonly clock: () => Date
  ) {}

  static async load(home: string, options: SessionStoreOptions = {}): Promise<SessionStore> {
    const filePath = join(home, "sessions.json");
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        await createDefaultJsonFile(filePath, DEFAULT);
        raw = await readFile(filePath, "utf8");
      } else {
        throw error;
      }
    }
    try {
      return new SessionStore(filePath, SessionsFileSchema.parse(JSON.parse(raw)), options.clock ?? (() => new Date()));
    } catch (error) {
      throw new Error(`Invalid sessions.json at ${filePath}: ${errorMessage(error)}`);
    }
  }

  list(): SessionRecord[] {
    return this.data.sessions.map((session) => ({ ...session }));
  }

  listByPrefix(sessionKeyPrefix: string): SessionRecord[] {
    return this.list().filter((session) => session.sessionKey.startsWith(sessionKeyPrefix));
  }

  get(sessionKey: string): SessionRecord | undefined {
    const session = this.data.sessions.find((entry) => entry.sessionKey === sessionKey);
    return session ? { ...session } : undefined;
  }

  async getOrCreate(sessionKey: string, options: SessionUpsertOptions = {}): Promise<SessionRecord> {
    const existing = this.get(sessionKey);
    if (existing) {
      return existing;
    }
    const now = this.clock().toISOString();
    const created: SessionRecord = {
      sessionKey,
      createdAt: now,
      lastActiveAt: now,
      status: "active",
      ...(options.agentKind ? { agentKind: options.agentKind } : {}),
      ...(options.name ? { name: options.name } : {})
    };
    await this.persist([...this.data.sessions, created]);
    return { ...created };
  }

  async touch(sessionKey: string): Promise<SessionRecord> {
    return this.mutate(sessionKey, (session) => ({
      ...session,
      lastActiveAt: this.clock().toISOString(),
      status: "active"
    }));
  }

  async rename(sessionKey: string, name: string): Promise<SessionRecord> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error("session name must not be empty");
    }
    return this.mutate(sessionKey, (session) => ({ ...session, name: trimmed }));
  }

  async setQuiet(sessionKey: string, quiet: boolean): Promise<SessionRecord> {
    return this.mutate(sessionKey, (session) => ({ ...session, quiet }));
  }

  async close(sessionKey: string): Promise<SessionRecord> {
    return this.mutate(sessionKey, (session) => ({
      ...session,
      status: "closed",
      lastActiveAt: this.clock().toISOString()
    }));
  }

  async reopen(sessionKey: string): Promise<SessionRecord> {
    return this.mutate(sessionKey, (session) => ({
      ...session,
      status: "active",
      lastActiveAt: this.clock().toISOString()
    }));
  }

  async remove(sessionKey: string): Promise<boolean> {
    const remaining = this.data.sessions.filter((session) => session.sessionKey !== sessionKey);
    if (remaining.length === this.data.sessions.length) {
      return false;
    }
    await this.persist(remaining);
    return true;
  }

  private async mutate(
    sessionKey: string,
    transform: (session: SessionRecord) => SessionRecord
  ): Promise<SessionRecord> {
    const index = this.data.sessions.findIndex((entry) => entry.sessionKey === sessionKey);
    if (index === -1) {
      throw new Error(`session not found: ${sessionKey}`);
    }
    const next = [...this.data.sessions];
    next[index] = transform({ ...next[index]! });
    await this.persist(next);
    return { ...next[index]! };
  }

  private async persist(sessions: SessionRecord[]): Promise<void> {
    const next: SessionsFile = { schemaVersion: 1, sessions };
    await writeJsonAtomically(this.filePath, next);
    this.data = next;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
