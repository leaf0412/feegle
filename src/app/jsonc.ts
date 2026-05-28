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

/**
 * Surgically remove the field at `path` from JSON/JSONC source text, preserving sibling fields
 * and unrelated comments. No-op if the path or any of its parents doesn't exist (jsonc-parser
 * raises "Can not delete in empty document" in that case — we treat that as success since the
 * post-condition "the field is absent" already holds).
 *
 * Caveat: comments immediately adjacent to the removed key are consumed along with it (this is a
 * jsonc-parser positioning quirk — the edit range covers the trailing whitespace/comment after the
 * key). Top-of-file or otherwise-separated comments survive untouched.
 */
export function unsetJsoncValue(raw: string, path: (string | number)[]): string {
  try {
    const edits = modify(raw, path, undefined, {
      formattingOptions: { tabSize: 2, insertSpaces: true }
    });
    return applyEdits(raw, edits);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Can not delete in empty document")) {
      return raw;
    }
    throw error;
  }
}
