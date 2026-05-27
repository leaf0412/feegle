/** Derive a repository display name from a git/web URL: last path segment,
 *  without a trailing slash or `.git` suffix. */
export function deriveRepositoryName(url: string): string {
  const stripped = url.replace(/\.git$/, "").replace(/\/$/, "");
  const segments = stripped.split("/");
  return segments[segments.length - 1] ?? stripped;
}
