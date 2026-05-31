const INSTALLED_FLAG = Symbol.for("feegle.console.timestamps.installed");

type ConsoleLevel = "debug" | "info" | "log" | "warn" | "error";

const LEVELS: ReadonlyArray<ConsoleLevel> = ["debug", "info", "log", "warn", "error"];

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad3(value: number): string {
  if (value < 10) {
    return `00${value}`;
  }
  if (value < 100) {
    return `0${value}`;
  }
  return String(value);
}

function formatLocalTimestamp(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const MM = pad2(date.getMinutes());
  const SS = pad2(date.getSeconds());
  const SSS = pad3(date.getMilliseconds());
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}.${SSS}`;
}

export function installConsoleTimestamps(): void {
  const store = console as unknown as Record<symbol, boolean>;
  if (store[INSTALLED_FLAG]) {
    return;
  }
  store[INSTALLED_FLAG] = true;

  for (const level of LEVELS) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      original(`[${formatLocalTimestamp(new Date())}]`, ...args);
    };
  }
}
