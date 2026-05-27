import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from "jsonc-parser";

export function parseJsonc(raw: string, filePath: string): unknown {
  const errors: ParseError[] = [];
  const value = parse(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new Error(`Invalid JSONC at ${filePath}: ${printParseErrorCode(first.error)} at offset ${first.offset}`);
  }
  return value;
}

/**
 * Surgically set a single value at `path` in JSON/JSONC source text, preserving all other fields,
 * comments and `{env:...}` tokens. Returns the new source text.
 */
export function setJsoncValue(raw: string, path: (string | number)[], value: unknown): string {
  const edits = modify(raw, path, value, {
    formattingOptions: { tabSize: 2, insertSpaces: true }
  });
  return applyEdits(raw, edits);
}
