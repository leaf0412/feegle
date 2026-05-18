import { describe, expect, it } from "vitest";
import { parseOwnerIdentities } from "../../src/app/owner-identities.js";

describe("parseOwnerIdentities", () => {
  it("normalizes comma-separated owner ids for owner-only scheduler commands", () => {
    expect([...parseOwnerIdentities(" feishu:ou_1,feishu:ou_2 ,, ")]).toEqual([
      "feishu:ou_1",
      "feishu:ou_2"
    ]);
  });

  it("returns an empty set when not configured so callers can disable owner-only commands", () => {
    expect(parseOwnerIdentities(undefined).size).toBe(0);
  });
});
