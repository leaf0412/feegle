import { normalizeOwnerEmail } from "../platform/owner-access.js";

export function parseOwnerEmails(input: string | undefined): ReadonlySet<string> {
  if (!input) {
    return new Set();
  }
  return new Set(
    input
      .split(",")
      .map((value) => normalizeOwnerEmail(value))
      .filter((value) => value.length > 0)
  );
}

export function normalizeOwnerEmails(emails: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((emails ?? []).map((value) => normalizeOwnerEmail(value)).filter((value) => value.length > 0));
}
