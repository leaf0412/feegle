import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

export function parseJsonc(raw: string, filePath: string): unknown {
  const errors: ParseError[] = [];
  const value = parse(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new Error(`Invalid JSONC at ${filePath}: ${printParseErrorCode(first.error)} at offset ${first.offset}`);
  }
  return value;
}
