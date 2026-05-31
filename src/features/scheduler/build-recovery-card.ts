import { createPlatformCard, type PlatformCard } from "../../platform/platform-card.js";
import type { Task } from "./task.js";

export function buildRecoveryCard(task: Task, now: Date): PlatformCard {
  return createPlatformCard()
    .title("任务恢复", "green")
    .markdown(`task: ${task.kind} (${task.id})\n之前连续失败: ${task.consecutiveFailures} 次\n最近成功: ${now.toISOString()}`)
    .build();
}
