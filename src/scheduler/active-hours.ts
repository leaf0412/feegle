import { toZonedTime } from "date-fns-tz";
import type { Task } from "./task.js";

export function withinActiveHours(task: Task, now: Date): boolean {
  if (!task.activeHours || task.activeHours.length === 0) {
    return true;
  }
  const local = toZonedTime(now, task.timezone);
  const minutes = local.getHours() * 60 + local.getMinutes();
  return task.activeHours.some((range) => {
    const [startRaw, endRaw] = range.split("-");
    if (!startRaw || !endRaw) {
      throw new Error(`Invalid activeHours range: ${range}`);
    }
    const start = parseHHmm(startRaw);
    const end = parseHHmm(endRaw);
    if (start > end) {
      throw new Error(`Cross-day activeHours range is not supported: ${range}`);
    }
    return minutes >= start && minutes <= end;
  });
}

export function localDateString(now: Date, timezone: string): string {
  const local = toZonedTime(now, timezone);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseHHmm(input: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(input);
  if (!match) {
    throw new Error(`Invalid HH:mm value: ${input}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid HH:mm value: ${input}`);
  }
  return hours * 60 + minutes;
}
