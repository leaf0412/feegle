const patterns: Array<{ regex: RegExp; replacement: string }> = [
  // Bearer tokens and API keys
  { regex: /bearer\s+[a-zA-Z0-9_\-\.]+/gi, replacement: "bearer [REDACTED]" },
  // JWT-like tokens (three base64url segments separated by dots)
  { regex: /eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/g, replacement: "[REDACTED_JWT]" },
  // Generic secret/key patterns: KEY=VALUE where VALUE looks like a token
  { regex: /(?:SECRET|TOKEN|KEY|PASSWORD|AUTH)\s*[:=]\s*\S+/gi, replacement: "$&" },
  // Connection strings with credentials
  { regex: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@/gi, replacement: "postgres://[REDACTED]:[REDACTED]@" },
  // Private key headers
  { regex: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/g, replacement: "[REDACTED_PRIVATE_KEY]" },
  // AWS-style access keys
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED_AWS_KEY]" }
];

// Only redact connection strings and private keys (deterministic patterns).
// KEY=VALUE matching is too broad and would flag legitimate content.
const activePatterns = [
  patterns[0], // bearer tokens
  patterns[1], // JWT tokens
  patterns[3], // connection strings
  patterns[4], // private keys
  patterns[5]  // AWS keys
];

export function redactSensitive(content: string): string {
  let result = content;
  for (const pattern of activePatterns) {
    result = result.replace(pattern.regex, pattern.replacement);
  }
  return result;
}
