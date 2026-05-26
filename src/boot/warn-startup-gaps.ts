import type { ConfigStorePort } from "../app/config-store.js";
import type { TaskRegistry } from "../scheduler/task-registry.js";

export function warnStartupGaps(
  configStore: ConfigStorePort,
  taskRegistry: TaskRegistry,
  ownerEmails: ReadonlySet<string>
): void {
  const tasks = taskRegistry.list();
  if (configStore.get().failureTarget === null && tasks.some((task) => task.enabled)) {
    console.warn("⚠️ failureTarget not configured; enabled tasks exist. Run /error_target set in your target Feishu chat.");
  }
  if (ownerEmails.size === 0 && tasks.some((task) => task.source === "domain" || task.source === "user")) {
    console.warn("⚠️ FEEGLE_OWNER_EMAILS not set; all owner-only commands will be silently denied.");
  }
}
