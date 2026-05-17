const SENSITIVE_PARAMS = [
  "device_id=",
  "access_key=",
  "ticket=",
  "conn_id=",
  "secret=",
  "token=",
  "password=",
  "key="
];

const HEARTBEAT_NEEDLES = ["ping success", "receive pong"];

export function sanitizeLogString(value: string): string {
  let result = value;
  for (const param of SENSITIVE_PARAMS) {
    let from = 0;
    while (true) {
      const start = result.indexOf(param, from);
      if (start < 0) {
        break;
      }
      const valueStart = start + param.length;
      let valueEnd = valueStart;
      while (valueEnd < result.length && result[valueEnd] !== "&" && result[valueEnd] !== " ") {
        valueEnd += 1;
      }
      result = result.slice(0, valueStart) + "***" + result.slice(valueEnd);
      from = valueStart + 3;
    }
  }
  return result;
}

export function sanitizeLogArgs(args: ReadonlyArray<unknown>): unknown[] {
  return args.map((arg) => (typeof arg === "string" ? sanitizeLogString(arg) : arg));
}

export function shouldSuppressDebug(args: ReadonlyArray<unknown>): boolean {
  return args.some((arg) => {
    if (typeof arg !== "string") {
      return false;
    }
    const lowered = arg.toLowerCase();
    return HEARTBEAT_NEEDLES.some((needle) => lowered.includes(needle));
  });
}

export interface LeveledLogger {
  debug?: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export function createSanitizingLogger(inner: LeveledLogger): Required<LeveledLogger> {
  const debug = inner.debug ?? (() => {});
  return {
    debug: (...args: unknown[]) => {
      if (shouldSuppressDebug(args)) {
        return;
      }
      debug(...sanitizeLogArgs(args));
    },
    info: (...args: unknown[]) => inner.info(...sanitizeLogArgs(args)),
    warn: (...args: unknown[]) => inner.warn(...sanitizeLogArgs(args)),
    error: (...args: unknown[]) => inner.error(...sanitizeLogArgs(args))
  };
}
