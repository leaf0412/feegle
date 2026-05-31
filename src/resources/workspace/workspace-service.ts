import type {
  ConversationBindingRecord,
  MembershipRecord,
  UserRecord,
  WorkspaceRecord
} from "./workspace-models.js";
import type { WorkspaceStore } from "./workspace-store.js";

export class WorkspaceService {
  constructor(private readonly store: WorkspaceStore) {}

  createPersonalWorkspace(input: {
    workspaceId: string;
    workspaceName: string;
    userId: string;
    displayName: string;
    now: string;
  }): { workspace: WorkspaceRecord; user: UserRecord; membership: MembershipRecord } {
    return this.store.createWorkspaceWithOwner(input);
  }

  bindConversation(input: {
    conversationKey: string;
    workspaceId: string;
    projectId: string | null;
    now: string;
  }): ConversationBindingRecord {
    return this.store.bindConversation(input);
  }
}
