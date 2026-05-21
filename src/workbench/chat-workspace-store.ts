import type { RuntimeDb } from "../app/runtime-db.js";

export interface ChatWorkspaceBinding {
  chatId: string;
  workspacePath: string;
  defaultProvider?: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface UpsertChatWorkspaceBindingInput {
  chatId: string;
  workspacePath: string;
  defaultProvider?: string;
  updatedBy?: string;
}

interface ChatWorkspaceRow {
  chat_id: string;
  workspace_path: string;
  default_provider: string | null;
  updated_by: string | null;
  updated_at: string;
}

export class ChatWorkspaceStore {
  constructor(
    private readonly db: RuntimeDb,
    private readonly now: () => Date = () => new Date()
  ) {}

  get(chatId: string): ChatWorkspaceBinding | undefined {
    const row = this.db
      .prepare("select * from chat_bindings where chat_id = ?")
      .get(chatId) as ChatWorkspaceRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  upsert(input: UpsertChatWorkspaceBindingInput): ChatWorkspaceBinding {
    const updatedAt = this.now().toISOString();
    this.db
      .prepare(
        `insert into chat_bindings (chat_id, workspace_path, default_provider, updated_by, updated_at)
         values (@chatId, @workspacePath, @defaultProvider, @updatedBy, @updatedAt)
         on conflict(chat_id) do update set
           workspace_path = excluded.workspace_path,
           default_provider = excluded.default_provider,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at`
      )
      .run({
        chatId: input.chatId,
        workspacePath: input.workspacePath,
        defaultProvider: input.defaultProvider ?? null,
        updatedBy: input.updatedBy ?? null,
        updatedAt
      });
    return {
      chatId: input.chatId,
      workspacePath: input.workspacePath,
      ...(input.defaultProvider ? { defaultProvider: input.defaultProvider } : {}),
      ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
      updatedAt
    };
  }
}

function fromRow(row: ChatWorkspaceRow): ChatWorkspaceBinding {
  return {
    chatId: row.chat_id,
    workspacePath: row.workspace_path,
    ...(row.default_provider ? { defaultProvider: row.default_provider } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
    updatedAt: row.updated_at
  };
}
