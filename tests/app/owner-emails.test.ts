import { describe, expect, it } from "vitest";
import { parseOwnerEmails } from "../../src/app/owner-emails.js";

describe("parseOwnerEmails", () => {
  it("normalizes comma-separated owner emails: trim + lowercase", () => {
    expect([...parseOwnerEmails(" Alice@Example.com, bob@example.com ,, ")]).toEqual([
      "alice@example.com",
      "bob@example.com"
    ]);
  });

  it("returns an empty set when not configured so callers can disable owner-only commands", () => {
    expect(parseOwnerEmails(undefined).size).toBe(0);
  });
});
