import type { RuntimeDb } from "@infra/app/runtime-db.js";

export interface AgentProviderCapabilities {
  /** Supported conversation modes (e.g. 'chat', 'plan', 'code-review'). */
  modes?: string[];
  /** Whether the provider supports ACP session resumption. */
  supportsSessionResume?: boolean;
  /** Free-form metadata attached by the registering plugin. */
  [key: string]: unknown;
}

export interface AgentProviderRecord {
  id: string;
  workspaceId: string;
  providerKey: string;
  displayName: string;
  enabled: boolean;
  capabilities: AgentProviderCapabilities | null;
  createdAt: string;
  updatedAt: string;
}

interface DbAgentProviderRow {
  id: string;
  workspace_id: string;
  provider_key: string;
  display_name: string;
  enabled: number;
  capabilities: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbAgentProviderRow): AgentProviderRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    providerKey: row.provider_key,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    capabilities: row.capabilities ? (JSON.parse(row.capabilities) as AgentProviderCapabilities) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class AgentProviderStore {
  constructor(private readonly db: RuntimeDb) {}

  register(input: {
    id: string;
    workspaceId: string;
    providerKey: string;
    displayName: string;
    capabilities?: AgentProviderCapabilities | null;
    now: string;
  }): AgentProviderRecord {
    const record: AgentProviderRecord = {
      id: input.id,
      workspaceId: input.workspaceId,
      providerKey: input.providerKey,
      displayName: input.displayName,
      enabled: true,
      capabilities: input.capabilities ?? null,
      createdAt: input.now,
      updatedAt: input.now
    };

    this.db
      .prepare(
        `insert into agent_providers
          (id, workspace_id, provider_key, display_name, enabled, capabilities, created_at, updated_at)
         values (?, ?, ?, ?, 1, ?, ?, ?)
         on conflict(workspace_id, provider_key) do update set
          display_name = excluded.display_name,
          capabilities = excluded.capabilities,
          updated_at = excluded.updated_at`
      )
      .run(
        record.id,
        record.workspaceId,
        record.providerKey,
        record.displayName,
        record.capabilities ? JSON.stringify(record.capabilities) : null,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getByKey(workspaceId: string, providerKey: string): AgentProviderRecord | undefined {
    const row = this.db
      .prepare(
        `select id, workspace_id, provider_key, display_name, enabled, capabilities, created_at, updated_at
         from agent_providers
         where workspace_id = ? and provider_key = ?`
      )
      .get(workspaceId, providerKey) as DbAgentProviderRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  getById(id: string): AgentProviderRecord | undefined {
    const row = this.db
      .prepare(
        `select id, workspace_id, provider_key, display_name, enabled, capabilities, created_at, updated_at
         from agent_providers
         where id = ?`
      )
      .get(id) as DbAgentProviderRow | undefined;

    return row ? mapRow(row) : undefined;
  }

  listByWorkspace(workspaceId: string): AgentProviderRecord[] {
    const rows = this.db
      .prepare(
        `select id, workspace_id, provider_key, display_name, enabled, capabilities, created_at, updated_at
         from agent_providers
         where workspace_id = ?
         order by provider_key asc`
      )
      .all(workspaceId) as DbAgentProviderRow[];

    return rows.map(mapRow);
  }

  setEnabled(input: {
    id: string;
    enabled: boolean;
    now: string;
  }): void {
    this.db
      .prepare(
        `update agent_providers set enabled = ?, updated_at = ? where id = ?`
      )
      .run(input.enabled ? 1 : 0, input.now, input.id);
  }

  isProviderEnabled(workspaceId: string, providerKey: string): boolean {
    const row = this.db
      .prepare(
        `select enabled from agent_providers
         where workspace_id = ? and provider_key = ?`
      )
      .get(workspaceId, providerKey) as { enabled: number } | undefined;

    return row ? row.enabled === 1 : false;
  }
}
