export interface PolicyRequest {
  actor: string;
  action: string;
  resource: { type: string; id: string };
  workspaceId: string;
}

export type PolicyDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "require_approval"; reason: string }
  | { kind: "limit_scope"; maxRole: string }
  | { kind: "require_input"; reason: string };

export type MembershipChecker = (workspaceId: string, userId: string) => boolean;

export class PolicyService {
  private readonly membershipChecker?: MembershipChecker;

  constructor(membershipChecker?: MembershipChecker) {
    this.membershipChecker = membershipChecker;
  }

  can(request: PolicyRequest): boolean {
    if (request.actor === "system") return true;
    if (!this.membershipChecker) return true;
    return this.membershipChecker(request.workspaceId, request.actor);
  }

  evaluate(request: PolicyRequest): PolicyDecision {
    if (!this.can(request)) {
      return {
        kind: "deny",
        reason: `actor ${request.actor} is not authorized to ${request.action} on ${request.resource.type} ${request.resource.id} in workspace ${request.workspaceId}`
      };
    }
    return { kind: "allow" };
  }

  decidePermission(allowed: boolean, reason: string): PolicyDecision {
    if (!allowed) {
      return { kind: "deny", reason };
    }
    return { kind: "allow" };
  }

  decideApproval(role: string | null, requiresAdmin: boolean): PolicyDecision {
    if (!role) return { kind: "deny", reason: "not a member" };
    if (requiresAdmin && role !== "owner" && role !== "admin") {
      return { kind: "require_approval", reason: "requires admin or owner approval" };
    }
    return { kind: "allow" };
  }
}
