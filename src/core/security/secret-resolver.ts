/**
 * Platform-wide secret reference contract.
 *
 * Every module that needs a secret consumes a `SecretReference` and resolves it through the
 * platform `SecretResolver` — never by reading environment variables or config directly.
 * This gives the runtime a single point of audit, denial, and redaction.
 */

export interface SecretReference {
  ref: string; // e.g. "secret/github-webhook", "secret/gitlab-token"
}

export interface SecretResolverContext {
  workspaceId: string;
  pluginId: string;
  effectType?: string;
}

export type SecretResolverResult =
  | { status: "resolved"; value: string }
  | { status: "missing"; reason: string }
  | { status: "denied"; reason: string }
  | { status: "unavailable"; reason: string };

export interface SecretResolver {
  resolve(ref: string, context: SecretResolverContext): Promise<SecretResolverResult>;
}

// ---------------------------------------------------------------------------
// Durable-state secret scanning — STEP 4 helpers
// ---------------------------------------------------------------------------
//
// RuntimeEvent payloads, EffectExecution outputSummary, Artifact content and
// ControlAction payloads are persisted.  These helpers scan for known secret
// formats before persistence so that platform guard code can refuse or redact.

const SECRET_VALUE_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "GitHub PAT classic", pattern: /ghp_[a-zA-Z0-9]{36}/g },
  { name: "GitHub PAT fine-grained", pattern: /github_pat_[a-zA-Z0-9_]{22,}/g },
  { name: "GitLab PAT", pattern: /glpat-[a-zA-Z0-9\-_]{20,}/g },
  { name: "OpenAI key", pattern: /sk-(?:proj-)?[a-zA-Z0-9]{32,}/g },
  { name: "Anthropic key", pattern: /sk-ant-[a-zA-Z0-9\-_]{32,}/g },
  { name: "Slack token", pattern: /xox[bspar]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24,}/g },
  { name: "JWT", pattern: /eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g },
];

/**
 * Recursively scan `value` for strings that match known secret formats.
 * Returns true as soon as any pattern matches.
 */
export function containsSecretValue(value: unknown): boolean {
  if (typeof value === "string") {
    for (const { pattern } of SECRET_VALUE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(value)) return true;
    }
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSecretValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) =>
      containsSecretValue(v)
    );
  }
  return false;
}

/**
 * Recursively redact known secret patterns from a value, replacing each
 * match with a descriptive `[REDACTED_<NAME>]` placeholder.  The original
 * structure (objects / arrays) is preserved.
 */
export function redactSecretValues(value: string): string;
export function redactSecretValues<T>(value: T): T;
export function redactSecretValues<T>(value: T): T {
  if (typeof value === "string") {
    let result: string = value;
    for (const { name, pattern } of SECRET_VALUE_PATTERNS) {
      pattern.lastIndex = 0;
      result = result.replace(
        pattern,
        `[REDACTED_${name.replace(/\s+/g, "_").toUpperCase()}]`
      );
    }
    return result as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretValues(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactSecretValues(val);
    }
    return out as unknown as T;
  }
  return value;
}
