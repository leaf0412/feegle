import { describe, expect, it } from "vitest";
import {
  containsSecretValue,
  redactSecretValues
} from "@core/security/secret-resolver.js";
import type {
  SecretResolver,
  SecretResolverContext,
  SecretResolverResult
} from "@core/security/secret-resolver.js";

// ---------------------------------------------------------------------------
// Resolver result shape tests (stateless — no concrete implementation needed)
// ---------------------------------------------------------------------------

describe("SecretResolverResult shapes", () => {
  function assertResolved(
    result: SecretResolverResult
  ): asserts result is { status: "resolved"; value: string } {
    if (result.status !== "resolved") throw new Error("expected resolved");
  }

  it("resolved carries a value", () => {
    const result: SecretResolverResult = {
      status: "resolved",
      value: "ghp_example_token"
    };
    assertResolved(result);
    expect(result.value).toBe("ghp_example_token");
  });

  it("missing carries a reason (not empty string)", () => {
    const result: SecretResolverResult = {
      status: "missing",
      reason: "secret not found in store"
    };
    expect(result.status).toBe("missing");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("denied carries a reason (not default/generic)", () => {
    const result: SecretResolverResult = {
      status: "denied",
      reason: "workspace not authorized for this secret"
    };
    expect(result.status).toBe("denied");
    expect(result.reason).toContain("not authorized");
  });

  it("unavailable carries a reason (not crash)", () => {
    const result: SecretResolverResult = {
      status: "unavailable",
      reason: "secret backend unreachable"
    };
    expect(result.status).toBe("unavailable");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// containsSecretValue — durable-state guard
// ---------------------------------------------------------------------------

describe("containsSecretValue", () => {
  it("detects GitHub PAT classic (ghp_)", () => {
    expect(containsSecretValue("ghp_abcdefghijklmnopqrstuvwxyz1234567890")).toBe(true);
  });

  it("detects GitHub PAT fine-grained (github_pat_)", () => {
    expect(
      containsSecretValue("github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    ).toBe(true);
  });

  it("detects GitLab PAT (glpat-)", () => {
    expect(containsSecretValue("glpat-abcdefghijklmnopqrst")).toBe(true);
  });

  it("detects OpenAI key (sk-)", () => {
    expect(containsSecretValue("sk-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
  });

  it("detects OpenAI project key (sk-proj-)", () => {
    expect(
      containsSecretValue("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890")
    ).toBe(true);
  });

  it("detects Anthropic key (sk-ant-)", () => {
    expect(
      containsSecretValue("sk-ant-api03-abcdefghijklmnopqrstuvwxyz123")
    ).toBe(true);
  });

  it("returns false for normal strings", () => {
    expect(containsSecretValue("hello world")).toBe(false);
    expect(containsSecretValue("https://github.com/user/repo")).toBe(false);
    expect(containsSecretValue("")).toBe(false);
  });

  it("rejects numbers", () => {
    expect(containsSecretValue(42)).toBe(false);
    expect(containsSecretValue(3.14)).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(containsSecretValue(null)).toBe(false);
    expect(containsSecretValue(undefined)).toBe(false);
  });

  it("recurses into objects", () => {
    expect(
      containsSecretValue({ nested: { key: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" } })
    ).toBe(true);
    expect(
      containsSecretValue({ a: { b: { c: "normal value" } } })
    ).toBe(false);
  });

  it("recurses into arrays", () => {
    expect(containsSecretValue(["a", "b", "sk-abcdefghijklmnopqrstuvwxyz123456"])).toBe(true);
    expect(containsSecretValue(["a", "b", "c"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// redactSecretValues — durable-state cleanup
// ---------------------------------------------------------------------------

describe("redactSecretValues", () => {
  it("redacts known secret patterns in strings", () => {
    const result = redactSecretValues("token: ghp_abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result).not.toContain("ghp_");
    expect(result).toContain("[REDACTED_GITHUB_PAT_CLASSIC]");
  });

  it("handles non-string primitives", () => {
    expect(redactSecretValues(42)).toBe(42);
    expect(redactSecretValues(null)).toBe(null);
    expect(redactSecretValues(true)).toBe(true);
  });

  it("recurses into objects", () => {
    const input = {
      action: "push",
      credentials: {
        apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456",
        name: "test-key"
      }
    };
    const result = redactSecretValues(input);
    expect(result.action).toBe("push");
    expect(result.credentials.name).toBe("test-key");
    expect(result.credentials.apiKey).not.toContain("sk-");
    expect(result.credentials.apiKey).toContain("[REDACTED_OPENAI_KEY]");
  });

  it("recurses into arrays", () => {
    const input = ["normal", "glpat-abcdefghijklmnopqrst", "also normal"];
    const result = redactSecretValues(input);
    expect(result[0]).toBe("normal");
    expect(result[1]).toContain("[REDACTED_GITLAB_PAT]");
    expect(result[2]).toBe("also normal");
  });

  it("does not modify clean input", () => {
    const input = { action: "deploy", ref: "refs/heads/main" };
    expect(redactSecretValues(input)).toEqual(input);
  });
});

// ---------------------------------------------------------------------------
// SecretResolver interface is usable by test stubs
// ---------------------------------------------------------------------------

describe("SecretResolver interface (test stub)", () => {
  function makeResolver(
    secrets: Record<string, string>,
    denyPattern?: RegExp
  ): SecretResolver {
    return {
      async resolve(
        ref: string,
        _context: SecretResolverContext
      ): Promise<SecretResolverResult> {
        if (denyPattern?.test(ref)) {
          return { status: "denied", reason: `access denied for ${ref}` };
        }
        const value = secrets[ref];
        if (value === undefined) {
          return { status: "missing", reason: `no secret for ${ref}` };
        }
        return { status: "resolved", value };
      }
    };
  }

  it("resolves known secrets", async () => {
    const resolver = makeResolver({ "secret/test": "my-token" });
    const result = await resolver.resolve("secret/test", {
      workspaceId: "ws_1",
      pluginId: "test"
    });
    expect(result).toEqual({ status: "resolved", value: "my-token" });
  });

  it("returns missing for unknown secrets", async () => {
    const resolver = makeResolver({});
    const result = await resolver.resolve("secret/nonexistent", {
      workspaceId: "ws_1",
      pluginId: "test"
    });
    expect(result.status).toBe("missing");
    expect("reason" in result && result.reason).toBeTruthy();
  });

  it("returns denied for restricted secrets", async () => {
    const resolver = makeResolver(
      { "secret/admin": "super-secret" },
      /admin/
    );
    const result = await resolver.resolve("secret/admin", {
      workspaceId: "ws_1",
      pluginId: "test"
    });
    expect(result.status).toBe("denied");
  });

  it("includeSecretValues — compile-time check (no-op, verifies types)", () => {
    // This test verifies the type is exportable and importable.
    // No runtime assertions needed — tsc will catch type errors.
    const resolver: SecretResolver = {
      async resolve(_ref, _ctx) {
        return { status: "unavailable", reason: "not implemented" };
      }
    };
    expect(typeof resolver.resolve).toBe("function");
  });
});
