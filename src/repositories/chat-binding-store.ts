import type { Database, Statement } from "better-sqlite3";
import { z } from "zod";

/**
 * A ChatBinding maps a scope key (chat id, or `user:<openId>` for single-chat scope)
 * to the ordered list of repository ids it has been bound to.
 *
 * Storage: SQLite tables `chat_bindings` (header) + `chat_binding_repositories`
 * (children, ON DELETE CASCADE). Insertion order is preserved via the `ordinal` column.
 * The zod schema below is kept exported so external code that imported the type
 * (e.g. `ChatBinding`) keeps compiling; it is no longer used to validate file input.
 */
export const ChatBindingSchema = z.object({
  chatId: z.string().min(1),
  repositoryIds: z.array(z.string().min(1)),
  updatedAt: z.string()
});

export type ChatBinding = z.infer<typeof ChatBindingSchema>;

export interface BindInput {
  chatId: string;
  repositoryIds?: string[];
}

interface HeaderRow {
  scope_key: string;
  updated_at: string;
}

interface RepoRow {
  repository_id: string;
}

interface CountRow {
  n: number;
}

interface MaxOrdinalRow {
  m: number | null;
}

export class ChatBindingStore {
  private readonly getHeaderStmt: Statement;
  private readonly listReposStmt: Statement;
  private readonly upsertHeaderStmt: Statement;
  private readonly clearHeaderStmt: Statement;
  private readonly insertRepoStmt: Statement;
  private readonly deleteRepoStmt: Statement;
  private readonly clearReposStmt: Statement;
  private readonly countReposStmt: Statement;
  private readonly maxOrdinalStmt: Statement;
  private readonly addRepoTx: (chatId: string, repositoryId: string, now: string) => void;
  private readonly removeRepoTx: (chatId: string, repositoryId: string) => { removed: boolean; remaining: number };
  private readonly upsertTx: (chatId: string, repositoryIds: string[], now: string) => void;

  constructor(
    private readonly db: Database,
    private readonly clock: () => Date = () => new Date()
  ) {
    this.getHeaderStmt = db.prepare(
      `select scope_key, updated_at from chat_bindings where scope_key = ?`
    );
    this.listReposStmt = db.prepare(
      `select repository_id from chat_binding_repositories where scope_key = ? order by ordinal`
    );
    this.upsertHeaderStmt = db.prepare(
      `insert into chat_bindings(scope_key, updated_at) values (?, ?)
         on conflict(scope_key) do update set updated_at = excluded.updated_at`
    );
    this.clearHeaderStmt = db.prepare(`delete from chat_bindings where scope_key = ?`);
    this.insertRepoStmt = db.prepare(
      `insert into chat_binding_repositories(scope_key, repository_id, ordinal) values (?, ?, ?)
         on conflict(scope_key, repository_id) do nothing`
    );
    this.deleteRepoStmt = db.prepare(
      `delete from chat_binding_repositories where scope_key = ? and repository_id = ?`
    );
    this.clearReposStmt = db.prepare(
      `delete from chat_binding_repositories where scope_key = ?`
    );
    this.countReposStmt = db.prepare(
      `select count(*) as n from chat_binding_repositories where scope_key = ?`
    );
    this.maxOrdinalStmt = db.prepare(
      `select coalesce(max(ordinal), 0) as m from chat_binding_repositories where scope_key = ?`
    );

    this.addRepoTx = db.transaction((chatId: string, repositoryId: string, now: string) => {
      this.upsertHeaderStmt.run(chatId, now);
      const next = ((this.maxOrdinalStmt.get(chatId) as MaxOrdinalRow).m ?? 0) + 1;
      this.insertRepoStmt.run(chatId, repositoryId, next);
    });

    this.removeRepoTx = db.transaction((chatId: string, repositoryId: string) => {
      const result = this.deleteRepoStmt.run(chatId, repositoryId);
      const removed = result.changes > 0;
      if (!removed) {
        const present = (this.getHeaderStmt.get(chatId) as HeaderRow | undefined) !== undefined;
        const remaining = present ? (this.countReposStmt.get(chatId) as CountRow).n : 0;
        return { removed: false, remaining };
      }
      const remaining = (this.countReposStmt.get(chatId) as CountRow).n;
      if (remaining === 0) {
        // Mirror legacy "delete-when-empty" — leave no header behind so get() returns undefined.
        this.clearHeaderStmt.run(chatId);
      }
      return { removed: true, remaining };
    });

    this.upsertTx = db.transaction((chatId: string, repositoryIds: string[], now: string) => {
      this.upsertHeaderStmt.run(chatId, now);
      this.clearReposStmt.run(chatId);
      repositoryIds.forEach((id, index) => {
        this.insertRepoStmt.run(chatId, id, index + 1);
      });
    });
  }

  get(chatId: string): ChatBinding | undefined {
    const header = this.getHeaderStmt.get(chatId) as HeaderRow | undefined;
    if (!header) return undefined;
    const rows = this.listReposStmt.all(chatId) as RepoRow[];
    return {
      chatId: header.scope_key,
      repositoryIds: rows.map((row) => row.repository_id),
      updatedAt: header.updated_at
    };
  }

  async upsert(input: BindInput): Promise<ChatBinding> {
    const now = this.clock().toISOString();
    const repositoryIds = input.repositoryIds ?? this.get(input.chatId)?.repositoryIds ?? [];
    this.upsertTx(input.chatId, repositoryIds, now);
    return {
      chatId: input.chatId,
      repositoryIds: [...repositoryIds],
      updatedAt: now
    };
  }

  async addRepository(chatId: string, repositoryId: string): Promise<ChatBinding> {
    const now = this.clock().toISOString();
    this.addRepoTx(chatId, repositoryId, now);
    // get() always returns defined here because addRepoTx upserts the header first.
    const binding = this.get(chatId);
    if (!binding) {
      // Defensive: this should be unreachable; failing loud beats silent corruption.
      throw new Error(`chat-binding-store: addRepository succeeded but get(${chatId}) returned undefined`);
    }
    return binding;
  }

  async removeRepository(
    chatId: string,
    repositoryId: string
  ): Promise<{ removed: boolean; binding?: ChatBinding }> {
    const { removed, remaining } = this.removeRepoTx(chatId, repositoryId);
    if (!removed) {
      // Match legacy: when the id wasn't bound, surface the still-present binding (if any)
      // so callers can render "未在绑定中" without re-querying.
      return { removed: false, binding: this.get(chatId) };
    }
    if (remaining === 0) {
      return { removed: true };
    }
    return { removed: true, binding: this.get(chatId) };
  }

  async clear(chatId: string): Promise<boolean> {
    // FK ON DELETE CASCADE drops the chat_binding_repositories rows.
    const result = this.clearHeaderStmt.run(chatId);
    return result.changes > 0;
  }
}
