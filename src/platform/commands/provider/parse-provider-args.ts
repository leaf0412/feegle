export interface ParsedProviderArgs {
  kind: string;
  fields: Record<string, string>;
}

export function parseProviderArgs(raw: string): ParsedProviderArgs {
  const tokens = tokenize(raw.trim());
  if (tokens.length === 0) {
    throw new Error("kind is required");
  }
  const [kind, ...rest] = tokens;
  const fields: Record<string, string> = {};
  for (const token of rest) {
    const eqIndex = token.indexOf("=");
    if (eqIndex < 0) {
      throw new Error(`expected key=value: ${token}`);
    }
    const key = token.slice(0, eqIndex);
    const value = token.slice(eqIndex + 1);
    if (value.includes("=")) {
      throw new Error(`= in value not allowed: ${token}`);
    }
    fields[key] = value;
  }
  return { kind, fields };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let buffer = "";
  let inQuotes = false;
  for (const char of input) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (/\s/.test(char) && !inQuotes) {
      if (buffer.length > 0) {
        tokens.push(buffer);
        buffer = "";
      }
      continue;
    }
    buffer += char;
  }
  if (buffer.length > 0) {
    tokens.push(buffer);
  }
  return tokens;
}
