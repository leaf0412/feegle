import type { Clock } from "./task-context.js";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
