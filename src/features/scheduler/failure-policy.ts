import type { Task } from "./task.js";

export function decideShouldNotifyFailure(
  policy: Task["errorPolicy"],
  consecutiveFailures: number,
  lastErrorNotifiedAt: string | null,
  now: Date
): boolean {
  if (policy === "silent") {
    return false;
  }
  if (policy === "always" || consecutiveFailures === 1 || !lastErrorNotifiedAt) {
    return true;
  }
  return now.getTime() - new Date(lastErrorNotifiedAt).getTime() >= 30 * 60 * 1000;
}
