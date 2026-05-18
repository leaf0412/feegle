export type StockCode = string;

export class InvalidStockCodeError extends Error {
  readonly errorClass = "InvalidStockCodeError";
}

export function normalizeStockCode(input: string): StockCode {
  const value = input.trim().toLowerCase();
  const prefixed = /^(sh|sz)(\d{6})$/.exec(value);
  if (prefixed) {
    return `${prefixed[1]}${prefixed[2]}`;
  }
  const suffixed = /^(\d{6})\.(sh|sz)$/.exec(value);
  if (suffixed) {
    return `${suffixed[2]}${suffixed[1]}`;
  }
  const numeric = /^(\d{6})$/.exec(value);
  if (numeric) {
    const digits = numeric[1];
    if (digits.startsWith("6")) {
      return `sh${digits}`;
    }
    if (digits.startsWith("0") || digits.startsWith("3")) {
      return `sz${digits}`;
    }
    throw new InvalidStockCodeError(`Cannot infer stock market for ${input}; use sh/sz prefix`);
  }
  throw new InvalidStockCodeError(`Invalid stock code: ${input}`);
}
