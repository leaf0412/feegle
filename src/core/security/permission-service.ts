import type { WorkspaceStore } from "@resources/workspace/workspace-store.js";
import type { WorkspaceRole } from "@resources/workspace/workspace-models.js";

export interface PermissionCheck {
  allowed: boolean;
  role: WorkspaceRole | null;
  reason: string;
}

export class PermissionService {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  checkMembership(workspaceId: string, userId: string): PermissionCheck {
    const membership = this.workspaceStore.getMembership(workspaceId, userId);
    if (!membership) {
      return { allowed: false, role: null, reason: `user ${userId} is not a member of workspace ${workspaceId}` };
    }
    return { allowed: true, role: membership.role, reason: "member" };
  }

  canWrite(role: WorkspaceRole | null): boolean {
    if (!role) return false;
    return role === "owner" || role === "admin" || role === "maintainer";
  }

  canApprove(role: WorkspaceRole | null): boolean {
    if (!role) return false;
    return role === "owner" || role === "admin";
  }

  canConfigure(role: WorkspaceRole | null): boolean {
    return role === "owner";
  }
}
