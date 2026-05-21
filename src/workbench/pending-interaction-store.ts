import type { RuntimeDb } from "../app/runtime-db.js";

export interface PendingInteraction {
  interactionId: string;
  chatId: string;
  messageId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

export interface PutPendingInteractionInput {
  interactionId: string;
  chatId: string;
  messageId: string;
  kind: string;
  payload: Record<string, unknown>;
  expiresAt: string;
}

interface PendingInteractionRow {
  interaction_id: string;
  chat_id: string;
  message_id: string;
  kind: string;
  payload_json: string;
  created_at: string;
  expires_at: string;
}

export class PendingInteractionStore {
  constructor(
    private readonly db: RuntimeDb,
    private readonly now: () => Date = () => new Date()
  ) {}

  put(input: PutPendingInteractionInput): PendingInteraction {
    const createdAt = this.now().toISOString();
    this.db
      .prepare(
        `insert into pending_interactions
           (interaction_id, chat_id, message_id, kind, payload_json, created_at, expires_at)
         values
           (@interactionId, @chatId, @messageId, @kind, @payloadJson, @createdAt, @expiresAt)`
      )
      .run({
        interactionId: input.interactionId,
        chatId: input.chatId,
        messageId: input.messageId,
        kind: input.kind,
        payloadJson: JSON.stringify(input.payload),
        createdAt,
        expiresAt: input.expiresAt
      });
    return { ...input, createdAt };
  }

  take(interactionId: string): PendingInteraction | undefined {
    return this.db.transaction((id: string) => {
      const row = this.db
        .prepare("select * from pending_interactions where interaction_id = ?")
        .get(id) as PendingInteractionRow | undefined;
      if (!row) {
        return undefined;
      }
      this.db.prepare("delete from pending_interactions where interaction_id = ?").run(id);
      return fromRow(row);
    })(interactionId);
  }

  deleteExpired(nowIso: string): number {
    const result = this.db
      .prepare("delete from pending_interactions where expires_at <= ?")
      .run(nowIso);
    return result.changes;
  }
}

function fromRow(row: PendingInteractionRow): PendingInteraction {
  return {
    interactionId: row.interaction_id,
    chatId: row.chat_id,
    messageId: row.message_id,
    kind: row.kind,
    payload: readPayload(row.payload_json),
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

function readPayload(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("pending interaction payload must be an object");
}
