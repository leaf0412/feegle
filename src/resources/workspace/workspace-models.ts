export const workspaceRoles = ["owner", "admin", "maintainer", "member", "viewer"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalIdentityRecord {
  id: string;
  userId: string;
  provider: string;
  externalUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationBindingRecord {
  conversationKey: string;
  workspaceId: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}
