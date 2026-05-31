import { describe, expect, it } from "vitest";
import { PolicyService } from "@core/security/policy-service.js";

describe("PolicyService", () => {
  const service = new PolicyService();

  it("allows permitted actions", () => {
    expect(service.decidePermission(true, "ok")).toEqual({ kind: "allow" });
  });

  it("denies non-permitted actions", () => {
    expect(service.decidePermission(false, "not allowed")).toEqual({ kind: "deny", reason: "not allowed" });
  });

  it("requires approval for admin-only actions by non-admin", () => {
    const result = service.decideApproval("member", true);
    expect(result.kind).toBe("require_approval");
  });

  it("allows admin for admin-only actions", () => {
    expect(service.decideApproval("owner", true)).toEqual({ kind: "allow" });
  });
});
