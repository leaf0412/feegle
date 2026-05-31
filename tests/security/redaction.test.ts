import { describe, expect, it } from "vitest";
import { redactSensitive } from "../../src/security/redaction.js";

describe("redactSensitive", () => {
  it("redacts bearer tokens", () => {
    const input = "Authorization: bearer abc123xyz";
    const output = redactSensitive(input);
    expect(output).not.toContain("abc123xyz");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts JWT tokens", () => {
    const input = "token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const output = redactSensitive(input);
    expect(output).not.toContain("eyJhbGci");
    expect(output).toContain("[REDACTED_JWT]");
  });

  it("redacts connection string credentials", () => {
    const input = "mongodb://admin:secret123@localhost:27017/db";
    const output = redactSensitive(input);
    expect(output).not.toContain("secret123");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts private keys", () => {
    const input = `key data:
-----BEGIN RSA PRIVATE KEY-----
MIICXAIBAAKBgQCqGKukO1De7zhZj6+H0qtjTkVxwTCpvKe4eCZ0FPqri0cb2JZfXJ/D
-----END RSA PRIVATE KEY-----`;
    const output = redactSensitive(input);
    expect(output).not.toContain("MIICXAIBAAKB");
    expect(output).toContain("[REDACTED_PRIVATE_KEY]");
  });

  it("does not redact normal text", () => {
    const input = "This is normal content with no secrets.";
    expect(redactSensitive(input)).toBe(input);
  });
});
