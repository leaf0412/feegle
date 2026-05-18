import type { Logger } from "./task-context.js";

export class ConsoleJsonLogger implements Logger {
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(message, meta ?? {});
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(message, meta ?? {});
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(message, meta ?? {});
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(message, meta ?? {});
  }
}
