import type { WorkspaceStore } from "./workspace-store.js";

export interface FeishuIdentityBootstrapInput {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  displayName: string;
  feishuOpenId: string;
  feishuChatId: string;
  now: string;
}

export interface FeishuIdentityBootstrapResult {
  workspaceId: string;
  userId: string;
  conversationKey: string;
  externalIdentityId: string;
}

export function bootstrapFeishuIdentity(
  store: WorkspaceStore,
  input: FeishuIdentityBootstrapInput
): FeishuIdentityBootstrapResult {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const workspaceName = required(input.workspaceName, "workspaceName");
  const userId = required(input.userId, "userId");
  const displayName = required(input.displayName, "displayName");
  const feishuOpenId = required(input.feishuOpenId, "feishuOpenId");
  const feishuChatId = required(input.feishuChatId, "feishuChatId");
  const now = required(input.now, "now");
  const conversationKey = `feishu:${feishuChatId}`;

  store.ensureWorkspace({ workspaceId, workspaceName, now });
  store.ensureUser({ userId, displayName, now });
  store.upsertMembership({ workspaceId, userId, role: "owner", now });
  const externalIdentity = store.linkExternalIdentity({
    provider: "feishu",
    externalUserId: feishuOpenId,
    userId,
    now
  });
  store.bindConversation({
    conversationKey,
    workspaceId,
    projectId: null,
    now
  });

  return {
    workspaceId,
    userId,
    conversationKey,
    externalIdentityId: externalIdentity.id
  };
}

function required(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}
