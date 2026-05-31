import type { AgentProviderRegistry } from "../../agent/agent-provider-registry.js";
import type { NotificationPort } from "@infra/app/notification-port.js";
import type { Task } from "./task.js";

export interface Clock {
  now(): Date;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface DailyDedupStore {
  checkAndMark(taskId: string, conditionKey: string, dateInTz: string): Promise<boolean>;
}

export interface HostInfo {
  hostname: string;
  pid: number;
}

export interface HostInfoProvider {
  read(): Promise<HostInfo>;
}

export interface TaskContext {
  task: Readonly<Task>;
  now: Date;
  logger: Logger;
  notify: NotificationPort;
  agents: AgentProviderRegistry;
  dedup: DailyDedupStore;
  host: HostInfoProvider;
}
