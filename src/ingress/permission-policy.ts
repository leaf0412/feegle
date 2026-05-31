import type { WorkspaceStore } from "../resources/workspace/workspace-store.js";
import type { WorkspaceRole } from "../resources/workspace/workspace-models.js";

export type PolicyDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "require_approval"; reason: string }
  | { kind: "limit_scope"; maxRole: WorkspaceRole }
  | { kind: "require_input"; reason: string };

export interface PermissionCheck {
  allowed: boolean;
  role: WorkspaceRole | null;
  reason: string;
}

export interface PermissionPolicyPort {
  checkPermission(workspaceId: string, userId: string): PermissionCheck;
  decide(permission: PermissionCheck, intentKind: string): PolicyDecision;
}

export class PermissionPolicy implements PermissionPolicyPort {
  constructor(private readonly workspaceStore: WorkspaceStore) {}

  checkPermission(workspaceId: string, userId: string): PermissionCheck {
    const membership = this.workspaceStore.getMembership(workspaceId, userId);
    if (!membership) {
      return { allowed: false, role: null, reason: `user ${userId} is not a member of workspace ${workspaceId}` };
    }
    return { allowed: true, role: membership.role, reason: "member" };
  }

  decide(permission: PermissionCheck, _intentKind: string): PolicyDecision {
    if (!permission.allowed) {
      return { kind: "deny", reason: permission.reason };
    }
    return { kind: "allow" };
  }
}
