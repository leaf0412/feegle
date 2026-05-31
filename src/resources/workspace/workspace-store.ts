import type { RuntimeDb } from "../../app/runtime-db.js";
import type {
  ConversationBindingRecord,
  ExternalIdentityRecord,
  MembershipRecord,
  ProjectRecord,
  UserRecord,
  WorkspaceRecord
} from "./workspace-models.js";

export class WorkspaceStore {
  constructor(private readonly db: RuntimeDb) {}

  createWorkspaceWithOwner(input: {
    workspaceId: string;
    workspaceName: string;
    userId: string;
    displayName: string;
    now: string;
  }): { workspace: WorkspaceRecord; user: UserRecord; membership: MembershipRecord } {
    const create = this.db.transaction(() => {
      this.db
        .prepare("insert into workspaces (id, name, created_at, updated_at) values (?, ?, ?, ?)")
        .run(input.workspaceId, input.workspaceName, input.now, input.now);
      this.db
        .prepare("insert into users (id, display_name, created_at, updated_at) values (?, ?, ?, ?)")
        .run(input.userId, input.displayName, input.now, input.now);
      this.db
        .prepare(
          `insert into memberships
            (workspace_id, user_id, role, created_at, updated_at)
           values (?, ?, 'owner', ?, ?)`
        )
        .run(input.workspaceId, input.userId, input.now, input.now);
    });
    create();

    return {
      workspace: {
        id: input.workspaceId,
        name: input.workspaceName,
        createdAt: input.now,
        updatedAt: input.now
      },
      user: {
        id: input.userId,
        displayName: input.displayName,
        createdAt: input.now,
        updatedAt: input.now
      },
      membership: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: "owner",
        createdAt: input.now,
        updatedAt: input.now
      }
    };
  }

  createProject(input: {
    projectId: string;
    workspaceId: string;
    name: string;
    now: string;
  }): ProjectRecord {
    this.db
      .prepare(
        "insert into projects (id, workspace_id, name, created_at, updated_at) values (?, ?, ?, ?, ?)"
      )
      .run(input.projectId, input.workspaceId, input.name, input.now, input.now);

    return {
      id: input.projectId,
      workspaceId: input.workspaceId,
      name: input.name,
      createdAt: input.now,
      updatedAt: input.now
    };
  }

  bindConversation(input: {
    conversationKey: string;
    workspaceId: string;
    projectId: string | null;
    now: string;
  }): ConversationBindingRecord {
    this.db
      .prepare(
        `insert into conversation_bindings_v2
          (conversation_key, workspace_id, project_id, created_at, updated_at)
         values (?, ?, ?, ?, ?)
         on conflict(conversation_key) do update set
          workspace_id = excluded.workspace_id,
          project_id = excluded.project_id,
          updated_at = excluded.updated_at`
      )
      .run(input.conversationKey, input.workspaceId, input.projectId, input.now, input.now);

    return {
      conversationKey: input.conversationKey,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      createdAt: input.now,
      updatedAt: input.now
    };
  }

  getMembership(workspaceId: string, userId: string): MembershipRecord | undefined {
    const row = this.db
      .prepare(
        `select workspace_id, user_id, role, created_at, updated_at
         from memberships
         where workspace_id = ? and user_id = ?`
      )
      .get(workspaceId, userId) as DbMembershipRow | undefined;

    return row ? mapMembership(row) : undefined;
  }

  getConversationBinding(conversationKey: string): ConversationBindingRecord | undefined {
    const row = this.db
      .prepare(
        `select conversation_key, workspace_id, project_id, created_at, updated_at
         from conversation_bindings_v2
         where conversation_key = ?`
      )
      .get(conversationKey) as DbConversationBindingRow | undefined;

    return row ? mapConversationBinding(row) : undefined;
  }

  getExternalIdentity(provider: string, externalUserId: string): ExternalIdentityRecord | undefined {
    const row = this.db
      .prepare(
        `select id, user_id, provider, external_user_id, created_at, updated_at
         from external_identities
         where provider = ? and external_user_id = ?`
      )
      .get(provider, externalUserId) as DbExternalIdentityRow | undefined;

    return row ? mapExternalIdentity(row) : undefined;
  }

  getUser(userId: string): UserRecord | undefined {
    const row = this.db
      .prepare("select id, display_name, created_at, updated_at from users where id = ?")
      .get(userId) as DbUserRow | undefined;

    return row ? { id: row.id, displayName: row.display_name, createdAt: row.created_at, updatedAt: row.updated_at } : undefined;
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | undefined {
    const row = this.db
      .prepare("select id, name, created_at, updated_at from workspaces where id = ?")
      .get(workspaceId) as DbWorkspaceRow | undefined;

    return row ? { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at } : undefined;
  }

  linkExternalIdentity(input: {
    provider: string;
    externalUserId: string;
    userId: string;
    now: string;
  }): ExternalIdentityRecord {
    const id = `ext_${input.provider}_${input.externalUserId}`;
    this.db
      .prepare(
        `insert into external_identities (id, user_id, provider, external_user_id, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?)
         on conflict(provider, external_user_id) do update set
          user_id = excluded.user_id,
          updated_at = excluded.updated_at`
      )
      .run(id, input.userId, input.provider, input.externalUserId, input.now, input.now);

    return {
      id,
      userId: input.userId,
      provider: input.provider,
      externalUserId: input.externalUserId,
      createdAt: input.now,
      updatedAt: input.now
    };
  }
}

interface DbMembershipRow {
  workspace_id: string;
  user_id: string;
  role: MembershipRecord["role"];
  created_at: string;
  updated_at: string;
}

interface DbExternalIdentityRow {
  id: string;
  user_id: string;
  provider: string;
  external_user_id: string;
  created_at: string;
  updated_at: string;
}

interface DbUserRow {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

interface DbWorkspaceRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface DbConversationBindingRow {
  conversation_key: string;
  workspace_id: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapExternalIdentity(row: DbExternalIdentityRow): ExternalIdentityRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    externalUserId: row.external_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMembership(row: DbMembershipRow): MembershipRecord {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapConversationBinding(row: DbConversationBindingRow): ConversationBindingRecord {
  return {
    conversationKey: row.conversation_key,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
