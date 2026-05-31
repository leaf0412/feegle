import type { RuntimeDb } from "../app/runtime-db.js";

export interface WebhookSourceRecord {
  id: string;
  name: string;
  pluginId: string;
  secretRef: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export class WebhookSourceStore {
  constructor(private readonly db: RuntimeDb) {}

  create(input: {
    id: string;
    name: string;
    pluginId: string;
    secretRef: string;
    now: string;
  }): WebhookSourceRecord {
    this.db
      .prepare(
        `insert into webhook_sources (id, name, plugin_id, secret_ref, enabled, created_at, updated_at)
         values (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(input.id, input.name, input.pluginId, input.secretRef, input.now, input.now);

    return { id: input.id, name: input.name, pluginId: input.pluginId, secretRef: input.secretRef, enabled: true, createdAt: input.now, updatedAt: input.now };
  }

  getById(id: string): WebhookSourceRecord | undefined {
    const row = this.db
      .prepare("select id, name, plugin_id, secret_ref, enabled, created_at, updated_at from webhook_sources where id = ?")
      .get(id) as DbWebhookSourceRow | undefined;
    return row ? mapWebhookSource(row) : undefined;
  }

  disable(id: string, now: string): void {
    this.db
      .prepare("update webhook_sources set enabled = 0, updated_at = ? where id = ?")
      .run(now, id);
  }
}

interface DbWebhookSourceRow {
  id: string;
  name: string;
  plugin_id: string;
  secret_ref: string;
  enabled: 0 | 1;
  created_at: string;
  updated_at: string;
}

function mapWebhookSource(row: DbWebhookSourceRow): WebhookSourceRecord {
  return {
    id: row.id,
    name: row.name,
    pluginId: row.plugin_id,
    secretRef: row.secret_ref,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
