/**
 * Resolves a GitLab token from config, preferring `secretRef`-based
 * resolution when available, falling back to the plain `token` field.
 *
 * When `secretRef` is set, the ref value (e.g. "secret/gitlab-token") is
 * mapped to an environment variable using the ref suffix after the last
 * slash, uppercased and sanitized (e.g. "GITLAB_TOKEN").
 */
export function resolveGitLabToken(
  gitlabConfig?: { token?: string; secretRef?: string }
): string {
  if (!gitlabConfig) return "";

  if (gitlabConfig.secretRef) {
    // Map secret ref → environment variable name.
    // e.g. "secret/gitlab-token" → "GITLAB_TOKEN"
    const suffix = gitlabConfig.secretRef.split("/").pop() ?? "";
    const envName = suffix.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
    const resolved = process.env[envName];
    if (resolved) return resolved;
    // If env var is not set, fall through to plain token as a best-effort.
  }

  return gitlabConfig.token ?? "";
}
