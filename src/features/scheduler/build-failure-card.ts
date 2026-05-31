import { createPlatformCard, type PlatformCard } from "@platform/platform-card.js";
import type { Task } from "./task.js";

export function buildFailureCard(task: Task, error: unknown, consecutiveFailures: number): PlatformCard {
  return createPlatformCard()
    .title("任务失败", "red")
    .markdown(`task: ${task.kind} (${task.id})\n错误: ${errorLabel(error)}\n连续失败: ${consecutiveFailures} 次`)
    .build();
}

function errorLabel(error: unknown): string {
  if (error instanceof Error) {
    const errorClass =
      typeof (error as Error & { errorClass?: unknown }).errorClass === "string"
        ? (error as Error & { errorClass: string }).errorClass
        : error.constructor.name;
    return `${errorClass}: ${error.message}`;
  }
  return String(error);
}
