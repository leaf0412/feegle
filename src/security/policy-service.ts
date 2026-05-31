export type PolicyDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "require_approval"; reason: string }
  | { kind: "limit_scope"; maxRole: string }
  | { kind: "require_input"; reason: string };

export class PolicyService {
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
