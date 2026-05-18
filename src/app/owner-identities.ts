export function parseOwnerIdentities(input: string | undefined): ReadonlySet<string> {
  if (!input) {
    return new Set();
  }
  return new Set(
    input
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
}
